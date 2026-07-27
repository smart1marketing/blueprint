import os,secrets,math
from decimal import Decimal,InvalidOperation
from functools import wraps
from dotenv import load_dotenv
load_dotenv()
from flask import Flask,render_template,request,redirect,url_for,session,flash,abort
from config import SETTINGS
from db import init_db,query_projects,metrics,alert_rows,get_project,get_websites,save_meta,infer_partner
from sync_service import sync_all,sync_detail
from simvoly_client import SimvolyClient
app=Flask(__name__); app.secret_key=SETTINGS.secret_key
app.config.update(SESSION_COOKIE_HTTPONLY=True,SESSION_COOKIE_SAMESITE='Lax',SESSION_COOKIE_SECURE=os.getenv('FLASK_ENV')=='production')
init_db(); client=SimvolyClient()
def login_required(f):
    @wraps(f)
    def w(*a,**k):
        if not session.get('authenticated'): return redirect(url_for('login',next=request.path))
        return f(*a,**k)
    return w
def csrf():
    a=request.form.get('csrf_token') or request.headers.get('X-CSRF-Token'); b=session.get('csrf')
    if not a or not b or not secrets.compare_digest(a,b): abort(400,'Invalid CSRF token')
def money(v):
    if v is None or v=='': return '—'
    try:return f'${Decimal(str(v)):,.2f}'
    except:return '—'
def status_class(s): return {'ACTIVE':'good','TRIAL':'warn','EXPIRED':'bad'}.get((s or '').upper(),'muted')
@app.context_processor
def ctx(): return {'money':money,'status_class':status_class,'settings':SETTINGS}
@app.get('/health')
def health(): return {'ok':True,'mock_mode':SETTINGS.mock_mode,'write_actions':SETTINGS.enable_write_actions}
@app.route('/login',methods=['GET','POST'])
def login():
    if request.method=='POST':
        if secrets.compare_digest(request.form.get('username',''),SETTINGS.admin_username) and secrets.compare_digest(request.form.get('password',''),SETTINGS.admin_password):
            session.clear(); session['authenticated']=True; session['csrf']=secrets.token_urlsafe(24); return redirect(request.args.get('next') or url_for('dashboard'))
        flash('Incorrect username or password.','danger')
    return render_template('login.html')
@app.post('/logout')
@login_required
def logout(): csrf(); session.clear(); return redirect(url_for('login'))
@app.get('/')
@login_required
def dashboard():
    q=request.args.get('q','').strip(); status=request.args.get('status','').strip(); plan=request.args.get('plan','').strip(); partner=request.args.get('partner','').strip()
    try: page=max(1,int(request.args.get('page','1')))
    except: page=1
    rows,count=query_projects(q,status,plan,partner,page,50); total,statuses,plans,allmeta,last=metrics(); revenue=cost=0.0; partner_counts={}
    for r in allmeta:
        cp=r['client_price'] if r['client_price'] is not None else (r['monthly_price'] or 0); pc=r['platform_cost'] if r['platform_cost'] is not None else ((r['bg_monthly_price'] or 0) if SETTINGS.use_bg_as_platform_cost else 0)
        if r['status']=='ACTIVE': revenue+=cp or 0; cost+=pc or 0
        p=r['partner'] or infer_partner(r['name']); partner_counts[p]=partner_counts.get(p,0)+1
    return render_template('dashboard.html',rows=rows,count=count,page=page,pages=max(1,math.ceil(count/50)),q=q,status=status,plan=plan,partner=partner,total=total,statuses=statuses,plans=plans,last=last,revenue=revenue,cost=cost,margin=revenue-cost,alerts=alert_rows(8),partners=sorted(partner_counts.items(),key=lambda x:-x[1])[:12])
@app.post('/sync')
@login_required
def sync():
    csrf()
    try:
        out=sync_all(); flash(f"Sync complete: {out['projects']} projects and {out['plans']} plans.",'success')
    except Exception as e: flash(f'Sync failed: {e}','danger')
    return redirect(url_for('dashboard'))
@app.get('/projects/<pid>')
@login_required
def project_detail(pid):
    p=get_project(pid)
    if not p: abort(404)
    return render_template('project_detail.html',p=p,websites=get_websites(pid))
@app.post('/projects/<pid>/refresh')
@login_required
def refresh_project(pid):
    csrf()
    try: flash(f'Website details refreshed ({sync_detail(pid)} record(s)).','success')
    except Exception as e: flash(f'Detail refresh failed: {e}','danger')
    return redirect(url_for('project_detail',pid=pid))
@app.post('/projects/<pid>/pricing')
@login_required
def pricing(pid):
    csrf()
    if not get_project(pid): abort(404)
    def num(k):
        v=request.form.get(k,'').strip()
        if not v:return None
        try:return float(Decimal(v))
        except InvalidOperation: raise ValueError
    try:
        save_meta(pid,num('client_price'),num('platform_cost'),request.form.get('partner','').strip(),request.form.get('notes','').strip(),request.form.get('internal_client_name','').strip()); flash('Pricing and account notes saved.','success')
    except ValueError: flash('Pricing fields must be valid numbers.','danger')
    return redirect(url_for('project_detail',pid=pid))
@app.route('/sites/add',methods=['GET','POST'])
@login_required
def add_site():
    _,_,plans,_,_=metrics()
    if request.method=='POST':
        csrf(); vals={k:request.form.get(k,'').strip() for k in ['site_name','email','first_name','last_name','plan_id','subdomain']}
        try: client.create_site(vals); flash('Create-site request sent.','success')
        except Exception as e: flash(str(e),'danger')
        return redirect(url_for('add_site'))
    return render_template('add_site.html',plans=plans)
@app.post('/projects/<pid>/action/<action>')
@login_required
def project_action(pid,action):
    csrf()
    if action not in {'suspend','reactivate','cancel'}: abort(404)
    if action=='cancel' and request.form.get('confirm')!='CANCEL': flash('Type CANCEL to confirm.','danger'); return redirect(url_for('project_detail',pid=pid))
    try: client.action(pid,action); flash(f'{action.title()} request sent.','success')
    except Exception as e: flash(str(e),'danger')
    return redirect(url_for('project_detail',pid=pid))
@app.errorhandler(404)
def nf(e): return render_template('error.html',code=404,message='Not found.'),404
@app.errorhandler(400)
def br(e): return render_template('error.html',code=400,message=e.description),400
