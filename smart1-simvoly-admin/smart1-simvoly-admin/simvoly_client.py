import json, os, requests
from config import SETTINGS
class SimvolyError(RuntimeError): pass
def nested(obj,path,default=None):
    cur=obj
    if not path: return obj
    for part in path.split('.'):
        if not isinstance(cur,dict): return default
        cur=cur.get(part,default)
    return cur
class SimvolyClient:
    def __init__(self): self.s=SETTINGS
    def headers(self):
        h={'Accept':'application/json','Content-Type':'application/json'}
        if self.s.api_key: h[self.s.auth_header]=(self.s.auth_prefix+' '+self.s.api_key).strip()
        return h
    def request(self,method,path,body=None):
        if not self.s.api_base_url: raise SimvolyError('SIMVOLY_API_BASE_URL is not configured.')
        if not path: raise SimvolyError('Required Simvoly endpoint path is not configured.')
        try: r=requests.request(method,self.s.api_base_url+'/'+path.lstrip('/'),headers=self.headers(),json=body,timeout=self.s.timeout_seconds,verify=self.s.verify_ssl)
        except requests.RequestException as e: raise SimvolyError(f'Could not reach Simvoly: {e}') from e
        if not r.ok: raise SimvolyError(f'Simvoly HTTP {r.status_code}: {r.text[:800]}')
        try: return r.json() if r.content else {}
        except ValueError: raise SimvolyError('Simvoly returned non-JSON.')
    def list_plans(self):
        if self.s.mock_mode: return mock_plans()
        data=self.request(os.getenv('SIMVOLY_LIST_PLANS_METHOD','GET'),os.getenv('SIMVOLY_LIST_PLANS_PATH',''))
        items=nested(data,os.getenv('SIMVOLY_PLANS_JSON_PATH','data'),data)
        if not isinstance(items,list): raise SimvolyError('Plan response did not resolve to a list.')
        return items
    def list_all_projects(self):
        if self.s.mock_mode: return mock_projects()
        template=os.getenv('SIMVOLY_LIST_PROJECTS_PATH_TEMPLATE','')
        if not template: raise SimvolyError('SIMVOLY_LIST_PROJECTS_PATH_TEMPLATE is not configured.')
        page=0; out=[]; pages=1
        while page<pages:
            path=template.replace('{page}',str(page)).replace('{search}','')
            data=self.request(os.getenv('SIMVOLY_LIST_PROJECTS_METHOD','GET'),path)
            items=nested(data,os.getenv('SIMVOLY_PROJECTS_JSON_PATH','data.items'),[])
            if not isinstance(items,list): raise SimvolyError('Project response did not resolve to a list.')
            out.extend(items); pages=int(nested(data,os.getenv('SIMVOLY_PAGES_JSON_PATH','data.pagesCount'),1) or 1); page+=1
            if page>500: raise SimvolyError('Pagination safety stop reached.')
        return out
    def project_detail(self,pid):
        if self.s.mock_mode: return mock_project_detail(pid)
        t=os.getenv('SIMVOLY_PROJECT_DETAIL_PATH_TEMPLATE','')
        if not t: return {}
        return self.request(os.getenv('SIMVOLY_PROJECT_DETAIL_METHOD','GET'),t.replace('{project_id}',str(pid)))
    def create_site(self,values):
        if self.s.mock_mode: return {'mock':True}
        if not self.s.enable_write_actions: raise SimvolyError('Write actions are disabled.')
        return self._action('CREATE_PROJECT',values)
    def action(self,pid,action):
        if self.s.mock_mode: return {'mock':True}
        if not self.s.enable_write_actions: raise SimvolyError('Write actions are disabled.')
        return self._action({'suspend':'SUSPEND_PROJECT','reactivate':'REACTIVATE_PROJECT','cancel':'CANCEL_PROJECT'}[action],{'project_id':pid})
    def _action(self,key,values):
        method=os.getenv(f'SIMVOLY_{key}_METHOD','POST'); path=os.getenv(f'SIMVOLY_{key}_PATH','')
        for k,v in values.items(): path=path.replace('{'+k+'}',str(v))
        raw=os.getenv(f'SIMVOLY_{key}_BODY','{}')
        for k,v in values.items(): raw=raw.replace('{'+k+'}',str(v).replace('"','\\"'))
        try: body=json.loads(raw)
        except Exception as e: raise SimvolyError(f'Invalid {key} body JSON: {e}')
        return self.request(method,path,None if method.upper()=='GET' else body)
def mock_plans():
    return [
      {'id':929,'name':'Landing Page - Self Service','monthlyPrice':22,'yearlyPrice':204,'bgMonthlyPrice':0,'bgYearlyPrice':0,'basePlan':'MINI_EXTENDED','hidden':True,'visible':True,'pages':2,'storage':1,'bandwidth':2,'contributors':1,'storeProducts':0,'websites':1},
      {'id':24,'name':'Starter Site - Self Service','monthlyPrice':29,'yearlyPrice':300,'bgMonthlyPrice':20,'bgYearlyPrice':180,'basePlan':'PERSONAL','hidden':False,'visible':True,'pages':5,'storage':2,'bandwidth':10,'contributors':2,'storeProducts':0,'websites':1},
      {'id':25,'name':'Business - Self Service','monthlyPrice':39,'yearlyPrice':420,'bgMonthlyPrice':30,'bgYearlyPrice':290,'basePlan':'BUSINESS','hidden':False,'visible':True,'pages':200,'storage':25,'bandwidth':25,'contributors':5,'storeProducts':0,'websites':1},
      {'id':927,'name':'Smart 1 Starter Premium','monthlyPrice':49,'yearlyPrice':588,'bgMonthlyPrice':0,'bgYearlyPrice':0,'basePlan':'PERSONAL','hidden':False,'visible':True,'pages':6,'storage':5,'bandwidth':10,'contributors':2,'storeProducts':5,'websites':1},
      {'id':928,'name':'Smart 1 Business Premium','monthlyPrice':79,'yearlyPrice':948,'bgMonthlyPrice':0,'bgYearlyPrice':0,'basePlan':'BUSINESS','hidden':False,'visible':True,'pages':25,'storage':500,'bandwidth':500,'contributors':5,'storeProducts':10,'websites':1},
      {'id':26,'name':'ECommerce Self Service','monthlyPrice':89,'yearlyPrice':948,'bgMonthlyPrice':40.83,'bgYearlyPrice':440,'basePlan':'ECOMMERCE','hidden':False,'visible':True,'pages':25,'storage':50,'bandwidth':100,'contributors':10,'storeProducts':100,'websites':1},
      {'id':930,'name':'Smart 1 Ecommerce','monthlyPrice':99,'yearlyPrice':1188,'bgMonthlyPrice':0,'bgYearlyPrice':0,'basePlan':'ECOMMERCE','hidden':False,'visible':True,'pages':50,'storage':100,'bandwidth':500,'contributors':10,'storeProducts':25,'websites':1},
      {'id':27,'name':'ECommerce Premium','monthlyPrice':129,'yearlyPrice':1428,'bgMonthlyPrice':57.5,'bgYearlyPrice':640,'basePlan':'ECOMMERCE_PLUS','hidden':False,'visible':True,'pages':999,'storage':999,'bandwidth':999,'contributors':30,'storeProducts':999,'websites':1}]
def mock_projects():
    return [
      {'id':764630,'name':'Daily Gazette - Brothers That Just Do Gutters','status':'ACTIVE','plan':{'name':'Landing Page - Self Service','id':929},'created':'07/13/2026','billingPeriod':'MONTHLY','lastBillingDate':'07/16/2026','nextBillingDate':'08/16/2026','recurringManualSubscription':True,'inFreeMonth':False,'overchargeEmails':False,'bandwidthPeriod':'July 15, 2026','lastInvoiceId':0},
      {'id':764551,'name':"TMRG - Dorr's Dorky Reptiles",'status':'ACTIVE','plan':{'name':'Starter Site - Self Service','id':24},'created':'07/12/2026','billingPeriod':'MONTHLY','lastBillingDate':'07/13/2026','nextBillingDate':'08/13/2026','recurringManualSubscription':True,'inFreeMonth':False,'overchargeEmails':False,'bandwidthPeriod':'July 12, 2026','lastInvoiceId':0},
      {'id':765533,'name':"Anna's Website",'status':'TRIAL','plan':{'name':'Trial','id':0},'created':'07/24/2026','billingPeriod':'MONTHLY','lastBillingDate':'','nextBillingDate':'','recurringManualSubscription':False,'inFreeMonth':False,'overchargeEmails':False,'bandwidthPeriod':'July 24, 2026','lastInvoiceId':0},
      {'id':763519,'name':"Nicholas's Website",'status':'EXPIRED','plan':{'name':'Trial','id':0},'created':'06/30/2026','billingPeriod':'MONTHLY','lastBillingDate':'','nextBillingDate':'','recurringManualSubscription':False,'inFreeMonth':False,'overchargeEmails':False,'bandwidthPeriod':'June 30, 2026','lastInvoiceId':0}]
def mock_project_detail(pid):
    return {'data':{'websites':{'items':[{'sentEmails':0,'marketingAllowance':1000,'marketingRisk':False,'created':'07/13/2026','domain':'brothersguttersny.com','name':'Daily Gazette - Brothers That Just Do Gutters','subdomain':'adops-189','active':True,'id':1609104,'type':'WEBSITE','marketingSubscribers':0}] if str(pid)=='764630' else []}}}
