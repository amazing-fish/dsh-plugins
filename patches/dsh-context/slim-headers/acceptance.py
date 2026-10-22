"""Disposable DSH 0.2.1-rc.2 HTTP A/B. No production home or ports are used."""
import argparse,hashlib,http.cookiejar,json,math,os,pathlib,re,statistics,subprocess,time,urllib.request

def compact(x): return json.dumps(x,separators=(',',':'),ensure_ascii=False)
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def seed(home,plugin,count):
    profile=home/'profiles'/'web';profile.mkdir(parents=True)
    (profile/'package.json').write_text(compact({'name':'isolated-web','private':True,'dependencies':{},'dsh':{'profile':{'bundles':['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}}))
    (profile/'cordis.yml').write_text('[]\n')
    (profile/'cordis.patch.yml').write_text('- id: session-persistence-jsonl\n  config:\n    root: '+compact(str(home/'sessions'))+'\n    compression: none\n- insert:\n    - id: context\n      name: dsh-context\n')
    modules=profile/'node_modules';modules.mkdir()
    if os.name=='nt':subprocess.run(['cmd','/c','mklink','/J',str(modules/'dsh-context'),str(plugin)],check=True,capture_output=True)
    else:(modules/'dsh-context').symlink_to(plugin,target_is_directory=True)
    cache=home/'storages'/'session_projcache'/'sessions';cache.mkdir(parents=True)
    for i in range(count):
        sid=f'bench-{i:04d}';created=1700000000000+i;epochs=45 if i==0 else 6
        head={'type':'session','version':4,'id':sid,'createdAt':created,'cwd':'/bench','isSeeded':False,'delegationDepth':0}
        events=[];stored=[]
        def ev(kind,data,**extra):
            events.append({'seq':len(events),'time':created+len(events),'type':kind,'data':data,**extra})
        ev('turn/start',{'turn':1});ev('step/start',{'turn':1,'step':1})
        for e in range(epochs):
            tools=[{'name':f'mcp__bench__tool_{j:02d}','description':f'epoch {e}','parameters':{'type':'object'}} for j in range(50)]
            seq=len(events);ev('request/header',{'header':{'config':{'model':'test','provider':'test'},'tools':tools},'reason':'initial' if e==0 else 'change'})
            stored.append({'seq':seq,'time':created+seq,'system':'legacy system','tools':[{'name':t['name'],'tokens':math.ceil(len(compact(t))/4)+4,'description':t['description'],'schema':t['parameters']} for t in tools]})
        ev('user/message',{'id':'u1','role':'user','content':[{'type':'text','text':'benchmark'}],'source':{'kind':'user'}},surfaceOp='append')
        ev('assistant/message',{'turn':1,'step':1,'message':{'id':'a1','role':'assistant','content':[{'type':'text','text':'benchmark response'}],'source':{'kind':'model','provider':'test','model':'test'}},'stream':[],'usage':{'inputTokens':10,'outputTokens':5}},surfaceOp='append')
        ev('step/end',{'turn':1,'step':1});ev('turn/end',{'turn':1,'reason':{'kind':'completed'}})
        directory=home/'sessions'/'--bench--'/sid;directory.mkdir(parents=True)
        (directory/'session.v4.jsonl').write_text('\n'.join(map(compact,[head]+events))+'\n')
        record={'identity':{'formatVersion':4,'createdAt':created,'cwd':'/bench','isSeeded':False,'inheritedEventCount':0},'rows':{'contextHeaders':{'ver':1,'seq':len(events)-1,'val':{'headers':stored}}}}
        (cache/(sid+'.json')).write_text(compact({'version':7,'record':record}))

class Server:
    def __init__(self,runtime,home):
        self.home=home;self.lines=[]
        self.p=subprocess.Popen(['node',str(runtime),'web','--port','0','--host','127.0.0.1','--no-open'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,env={**os.environ,'DSH_HOME':str(home),'DSH_TELEMETRY_DISABLED':'1'})
        while True:
            line=self.p.stdout.readline();self.lines.append(line)
            match=re.search(r'dsh web: (http://\S+)',line)
            if match:break
            if self.p.poll() is not None:raise RuntimeError(''.join(self.lines))
        url=match.group(1);self.origin=url.split('/?')[0]
        self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.opener.open(url,timeout=60).read()
    def post(self,route,body):
        request=urllib.request.Request(self.origin+route,data=compact(body).encode(),headers={'Content-Type':'application/json','Origin':self.origin},method='POST')
        start=time.perf_counter();raw=self.opener.open(request,timeout=90).read();elapsed=(time.perf_counter()-start)*1000
        return json.loads(raw),len(raw),elapsed
    def listing(self):
        body,size,elapsed=self.post('/api/session/list',{'type':'client-request','rpcId':'bench-list','method':'session/list','payload':{'args':{'_request':{}}}})
        assert body['result']['ok'],body
        return body['result']['value']['items'],size,elapsed
    def close(self):
        self.p.terminate()
        try:rest=self.p.communicate(timeout=20)[0]
        except subprocess.TimeoutExpired:self.p.kill();rest=self.p.communicate()[0]
        log=re.sub(r'token=[A-Za-z0-9_-]+','token=REDACTED',''.join(self.lines)+rest)
        (self.home/'server.log').write_text(log)

def measure(runtime,home,count):
    server=Server(runtime,home)
    try:
        cache=home/'storages'/'session_projcache'/'sessions'
        before={p.name:(digest(p),p.stat().st_mtime_ns) for p in cache.glob('*.json')}
        samples=[]
        for _ in range(4):
            items,size,ms=server.listing();assert len(items)==count,(len(items),count)
            headers=[i['projections']['values']['contextHeaders'] for i in items]
            samples.append({'bytes':size,'ms':round(ms,3),'header_bytes':sum(len(compact(h).encode()) for h in headers)})
        first=next(i for i in items if i['sessionId']=='bench-0000')
        detail,_,_=server.post('/api/dsh-context/detail',{'sessionId':'bench-0000'})
        assert detail['ok'] and detail['value'] is not None,detail
        epochs=detail['value'].get('headers',{}).get('headers',[])
        # The pristine endpoint has no header segment; candidate must return all details.
        if epochs:
            assert len(epochs)==45
            for epoch in epochs:
                assert len(epoch['tools'])==50
                for j,t in enumerate(epoch['tools']):
                    assert t['name']==f'mcp__bench__tool_{j:02d}' and t['tokens']>0 and t['plugin']=='mcp:bench'
        after={p.name:(digest(p),p.stat().st_mtime_ns) for p in cache.glob('*.json')}
        assert before==after,'list/detail must not migrate or rewrite legacy rows'
        witness=f'bench-{count-1:04d}'
        response,_,_=server.post('/api/dsh-context/backfill',{});assert response['ok'],response
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            record=json.loads((cache/(witness+'.json')).read_text())['record']['rows']
            if 'contextActivity' in record and 'contextTimeline' in record:break
            time.sleep(.1)
        else:raise AssertionError('backfill did not fill untouched witness')
        assert sum(d['requests'] for d in record['contextActivity']['val']['days'].values())==1
        warmed,_,_=server.listing();witness_value=next(i for i in warmed if i['sessionId']==witness)['projections']['values']
        assert 'contextActivity' in witness_value and 'contextTimeline' in witness_value
        header=first['projections']['values']['contextHeaders']
        return {'samples':samples,'warm_median_ms':round(statistics.median(s['ms'] for s in samples[1:]),3),'row_header_bytes':len(compact(header).encode()),'row_list_bytes':len(compact(first).encode()),'detail_epochs':len(epochs),'detail_tools':sum(len(e['tools']) for e in epochs),'legacy_files_unchanged_before_backfill':len(after),'backfill_witness':witness,'backfill_requests':1,'list_after_backfill':len(warmed)}
    finally:server.close()

def main():
    p=argparse.ArgumentParser();p.add_argument('--runtime',type=pathlib.Path,required=True);p.add_argument('--baseline',type=pathlib.Path,required=True);p.add_argument('--candidate',type=pathlib.Path,required=True);p.add_argument('--workdir',type=pathlib.Path,required=True);p.add_argument('--count',type=int,default=2542);a=p.parse_args()
    a.workdir.mkdir(parents=True,exist_ok=False)
    results={'environment':{'runtime':'DSH 0.2.1-rc.2','platform':os.name,'corpus':'synthetic','sessions':a.count,'epochs':'45 in bench-0000; 6 elsewhere','tools_per_epoch':50},'results':{}}
    for name,plugin in [('baseline',a.baseline),('candidate',a.candidate)]:
        home=a.workdir/name;seed(home,plugin.resolve(),a.count);results['results'][name]=measure(a.runtime.resolve(),home,a.count)
        print(name,compact(results['results'][name]),flush=True)
        (a.workdir/'results.json').write_text(json.dumps(results,indent=2))
    candidate=results['results']['candidate'];assert candidate['row_list_bytes']<=2048;assert candidate['detail_epochs']==45
if __name__=='__main__':main()
