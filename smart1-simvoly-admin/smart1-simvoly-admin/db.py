import os, sqlite3, json
from contextlib import contextmanager
from datetime import datetime, timezone
from config import SETTINGS

def now(): return datetime.now(timezone.utc).isoformat()
def db_path():
    path=SETTINGS.database_path
    folder=os.path.dirname(path)
    if folder: os.makedirs(folder, exist_ok=True)
    return path
@contextmanager
def connection():
    con=sqlite3.connect(db_path()); con.row_factory=sqlite3.Row
    try: yield con; con.commit()
    finally: con.close()
def init_db():
    with connection() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS plans(plan_id TEXT PRIMARY KEY,name TEXT,monthly_price REAL,yearly_price REAL,bg_monthly_price REAL,bg_yearly_price REAL,base_plan TEXT,hidden INTEGER,visible INTEGER,pages INTEGER,storage REAL,bandwidth REAL,contributors INTEGER,store_products INTEGER,websites INTEGER,raw_json TEXT,updated_at TEXT)''')
        c.execute('''CREATE TABLE IF NOT EXISTS projects(project_id TEXT PRIMARY KEY,name TEXT,status TEXT,plan_id TEXT,plan_name TEXT,created TEXT,billing_period TEXT,last_billing_date TEXT,next_billing_date TEXT,recurring_manual_subscription INTEGER,in_free_month INTEGER,overcharge_emails INTEGER,bandwidth_period TEXT,last_invoice_id TEXT,raw_json TEXT,updated_at TEXT)''')
        c.execute('''CREATE TABLE IF NOT EXISTS websites(website_id TEXT PRIMARY KEY,project_id TEXT,name TEXT,domain TEXT,subdomain TEXT,active INTEGER,type TEXT,created TEXT,sent_emails INTEGER,marketing_allowance INTEGER,marketing_risk INTEGER,marketing_subscribers INTEGER,raw_json TEXT,updated_at TEXT)''')
        c.execute('''CREATE TABLE IF NOT EXISTS project_meta(project_id TEXT PRIMARY KEY,client_price REAL,platform_cost REAL,partner TEXT,notes TEXT DEFAULT '',internal_client_name TEXT DEFAULT '',updated_at TEXT)''')
        # Upgrade the v1 project_meta table in place if this app is deployed over the original prototype.
        cols={r['name'] for r in c.execute('PRAGMA table_info(project_meta)')}
        if 'client_price' not in cols: c.execute('ALTER TABLE project_meta ADD COLUMN client_price REAL')
        if 'platform_cost' not in cols: c.execute('ALTER TABLE project_meta ADD COLUMN platform_cost REAL')
        if 'partner' not in cols: c.execute("ALTER TABLE project_meta ADD COLUMN partner TEXT DEFAULT ''")
        if 'notes' not in cols: c.execute("ALTER TABLE project_meta ADD COLUMN notes TEXT DEFAULT ''")
        if 'internal_client_name' not in cols: c.execute("ALTER TABLE project_meta ADD COLUMN internal_client_name TEXT DEFAULT ''")
        if 'updated_at' not in cols: c.execute("ALTER TABLE project_meta ADD COLUMN updated_at TEXT DEFAULT ''")
        cols={r['name'] for r in c.execute('PRAGMA table_info(project_meta)')}
        if 'retail_price' in cols:
            c.execute('UPDATE project_meta SET client_price=COALESCE(client_price,retail_price)')
        c.execute('''CREATE TABLE IF NOT EXISTS sync_runs(id INTEGER PRIMARY KEY AUTOINCREMENT,started_at TEXT,completed_at TEXT,status TEXT,projects_count INTEGER,plans_count INTEGER,details TEXT)''')
def upsert_plan(p):
    vals=(str(p.get('id','')),p.get('name',''),p.get('monthlyPrice'),p.get('yearlyPrice'),p.get('bgMonthlyPrice'),p.get('bgYearlyPrice'),p.get('basePlan',''),int(bool(p.get('hidden'))),int(bool(p.get('visible',True))),p.get('pages'),p.get('storage'),p.get('bandwidth'),p.get('contributors'),p.get('storeProducts'),p.get('websites'),json.dumps(p),now())
    with connection() as c:
        c.execute('''INSERT INTO plans VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(plan_id) DO UPDATE SET name=excluded.name,monthly_price=excluded.monthly_price,yearly_price=excluded.yearly_price,bg_monthly_price=excluded.bg_monthly_price,bg_yearly_price=excluded.bg_yearly_price,base_plan=excluded.base_plan,hidden=excluded.hidden,visible=excluded.visible,pages=excluded.pages,storage=excluded.storage,bandwidth=excluded.bandwidth,contributors=excluded.contributors,store_products=excluded.store_products,websites=excluded.websites,raw_json=excluded.raw_json,updated_at=excluded.updated_at''',vals)
def upsert_project(p):
    plan=p.get('plan') or {}
    vals=(str(p.get('id','')),p.get('name',''),p.get('status',''),str(plan.get('id','')),plan.get('name',''),p.get('created',''),p.get('billingPeriod',''),p.get('lastBillingDate',''),p.get('nextBillingDate',''),int(bool(p.get('recurringManualSubscription'))),int(bool(p.get('inFreeMonth'))),int(bool(p.get('overchargeEmails'))),p.get('bandwidthPeriod',''),str(p.get('lastInvoiceId','')),json.dumps(p),now())
    with connection() as c:
        c.execute('''INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET name=excluded.name,status=excluded.status,plan_id=excluded.plan_id,plan_name=excluded.plan_name,created=excluded.created,billing_period=excluded.billing_period,last_billing_date=excluded.last_billing_date,next_billing_date=excluded.next_billing_date,recurring_manual_subscription=excluded.recurring_manual_subscription,in_free_month=excluded.in_free_month,overcharge_emails=excluded.overcharge_emails,bandwidth_period=excluded.bandwidth_period,last_invoice_id=excluded.last_invoice_id,raw_json=excluded.raw_json,updated_at=excluded.updated_at''',vals)
def replace_websites(project_id,items):
    with connection() as c:
        c.execute('DELETE FROM websites WHERE project_id=?',(str(project_id),))
        for x in items:
            c.execute('''INSERT OR REPLACE INTO websites VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',(str(x.get('id','')),str(project_id),x.get('name',''),x.get('domain',''),x.get('subdomain',''),int(bool(x.get('active'))),x.get('type',''),x.get('created',''),x.get('sentEmails'),x.get('marketingAllowance'),int(bool(x.get('marketingRisk'))),x.get('marketingSubscribers'),json.dumps(x),now()))
def save_meta(project_id,client_price=None,platform_cost=None,partner='',notes='',internal_client_name=''):
    with connection() as c:
        c.execute('''INSERT INTO project_meta VALUES(?,?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET client_price=excluded.client_price,platform_cost=excluded.platform_cost,partner=excluded.partner,notes=excluded.notes,internal_client_name=excluded.internal_client_name,updated_at=excluded.updated_at''',(str(project_id),client_price,platform_cost,partner,notes,internal_client_name,now()))
def infer_partner(name):
    n=(name or '').strip()
    if ' - ' in n:
        p=n.split(' - ',1)[0].strip(); return {'S1M':'Smart 1','TMRG':'TMRG'}.get(p,p)
    if n.lower().startswith('smart 1'): return 'Smart 1'
    return 'Direct / Other'
def get_project(pid):
    with connection() as c:
        r=c.execute('''SELECT p.*,pl.monthly_price,pl.yearly_price,pl.bg_monthly_price,pl.bg_yearly_price,pl.base_plan,pl.pages,pl.storage,pl.bandwidth,pl.contributors,pl.store_products,pl.hidden,pl.visible,m.client_price,m.platform_cost,m.partner,m.notes,m.internal_client_name FROM projects p LEFT JOIN plans pl ON pl.plan_id=p.plan_id LEFT JOIN project_meta m ON m.project_id=p.project_id WHERE p.project_id=?''',(str(pid),)).fetchone()
        return dict(r) if r else None
def get_websites(pid):
    with connection() as c: return [dict(r) for r in c.execute('SELECT * FROM websites WHERE project_id=? ORDER BY name',(str(pid),))]
def query_projects(q='',status='',plan='',partner='',page=1,per_page=50):
    where=[]; args=[]
    if q:
        like=f'%{q}%'; where.append('(p.name LIKE ? OR w.domain LIKE ? OR p.project_id LIKE ? OR w.website_id LIKE ?)'); args += [like,like,like,like]
    if status: where.append('p.status=?'); args.append(status)
    if plan: where.append('p.plan_id=?'); args.append(plan)
    if partner: where.append('(m.partner=? OR p.name LIKE ?)'); args += [partner,partner+' - %']
    wc='WHERE '+' AND '.join(where) if where else ''; off=(page-1)*per_page
    with connection() as c:
        rows=[dict(r) for r in c.execute(f'''SELECT DISTINCT p.*,pl.monthly_price,pl.yearly_price,pl.bg_monthly_price,pl.bg_yearly_price,m.client_price,m.platform_cost,m.partner,m.notes,m.internal_client_name,(SELECT domain FROM websites ww WHERE ww.project_id=p.project_id LIMIT 1) domain FROM projects p LEFT JOIN plans pl ON pl.plan_id=p.plan_id LEFT JOIN project_meta m ON m.project_id=p.project_id LEFT JOIN websites w ON w.project_id=p.project_id {wc} ORDER BY CAST(p.project_id AS INTEGER) DESC LIMIT ? OFFSET ?''',args+[per_page,off])]
        count=c.execute(f'''SELECT COUNT(DISTINCT p.project_id) FROM projects p LEFT JOIN project_meta m ON m.project_id=p.project_id LEFT JOIN websites w ON w.project_id=p.project_id {wc}''',args).fetchone()[0]
    for r in rows: r['partner_display']=r.get('partner') or infer_partner(r.get('name'))
    return rows,count
def metrics():
    with connection() as c:
        statuses={r['status']:r['n'] for r in c.execute('SELECT status,COUNT(*) n FROM projects GROUP BY status')}; total=c.execute('SELECT COUNT(*) FROM projects').fetchone()[0]
        plans=[dict(r) for r in c.execute('SELECT plan_id,name,monthly_price,yearly_price,hidden,visible FROM plans ORDER BY monthly_price,name')]
        meta=[dict(r) for r in c.execute('''SELECT p.project_id,p.name,p.status,p.plan_id,pl.monthly_price,pl.bg_monthly_price,m.client_price,m.platform_cost,m.partner FROM projects p LEFT JOIN plans pl ON pl.plan_id=p.plan_id LEFT JOIN project_meta m ON m.project_id=p.project_id''')]
        last=c.execute('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1').fetchone()
    return total,statuses,plans,meta,(dict(last) if last else None)
def alert_rows(limit=100):
    from datetime import datetime,timedelta
    today=datetime.now().date(); soon=today+timedelta(days=7)
    with connection() as c: rows=[dict(r) for r in c.execute('SELECT * FROM projects ORDER BY CAST(project_id AS INTEGER) DESC')]
    out=[]
    for r in rows:
        kind=None
        if r['status']=='TRIAL': kind='Trial needs review'
        elif r['status']=='EXPIRED': kind='Expired site'
        elif r['status']=='ACTIVE' and not r['recurring_manual_subscription']: kind='Active without recurring subscription'
        if r.get('next_billing_date'):
            try:
                d=datetime.strptime(r['next_billing_date'],'%m/%d/%Y').date()
                if today<=d<=soon: kind=kind or 'Billing in next 7 days'
            except ValueError: pass
        if kind: r['alert']=kind; out.append(r)
    return out[:limit]
def start_sync():
    with connection() as c: return c.execute('INSERT INTO sync_runs(started_at,status,projects_count,plans_count,details) VALUES(?,?,?,?,?)',(now(),'RUNNING',0,0,'')).lastrowid
def finish_sync(i,status,pc,plc,details=''):
    with connection() as c: c.execute('UPDATE sync_runs SET completed_at=?,status=?,projects_count=?,plans_count=?,details=? WHERE id=?',(now(),status,pc,plc,details,i))
