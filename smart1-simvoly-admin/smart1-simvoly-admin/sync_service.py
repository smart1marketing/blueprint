from db import init_db,start_sync,finish_sync,upsert_plan,upsert_project,replace_websites
from simvoly_client import SimvolyClient,nested
def sync_all():
    init_db(); run=start_sync(); c=SimvolyClient(); pc=plc=0
    try:
        plans=c.list_plans(); [upsert_plan(p) for p in plans]; plc=len(plans)
        projects=c.list_all_projects(); [upsert_project(p) for p in projects]; pc=len(projects)
        finish_sync(run,'SUCCESS',pc,plc,''); return {'projects':pc,'plans':plc}
    except Exception as e:
        finish_sync(run,'FAILED',pc,plc,str(e)); raise
def sync_detail(pid):
    init_db(); data=SimvolyClient().project_detail(pid); items=nested(data,'data.websites.items',[])
    if isinstance(items,list): replace_websites(pid,items); return len(items)
    return 0
