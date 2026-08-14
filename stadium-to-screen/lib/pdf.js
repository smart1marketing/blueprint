/* Generates the Stadium to Screen proposal PDF as a Buffer (pdfkit).
   Styled after the Smart 1 "Marketing Efficiency Audit" report:
   branded navy header/footer, info card, audience sizing (ranges),
   good/better/best pricing scaled to fan base, savings-vs-traditional,
   budget disclaimers, and a closing consult CTA. */
const PDFDocument = require("pdfkit");

/* palette */
/* canonical Smart 1 brand tokens (see SPEC §1): navy #0A2240, blue #009ED2 */
const NAVY="#0A2240", NAVY_BOX="#16325C", INK="#2b3547", GRAY="#8a94a3", GRAYL="#a9b2c0",
      RULE="#dfe4ec", CARDBRD="#e6eaf1", TEAL="#2fd0c0", CYAN="#009ED2",
      YELLOW="#f5b400", GREEN="#15a88a", WHITE="#ffffff";

const PAGE_W=612, ML=54, MR=558, CW=MR-ML, TOP=90, BOTTOM=722;
const CONSULT_URL="https://smart1marketing.com/footballmarketingconsult";
const SPREAD=0.12;

const num=v=>{const x=Number(v);return isFinite(x)?x:0;};
const comma=x=>Math.round(x).toLocaleString("en-US");
const money=x=>"$"+comma(x);
function kfmt(x){x=Math.round(x);if(x>=1e6)return(x/1e6).toFixed(x>=1e7?1:2).replace(/\.0+$/,"")+"M";if(x>=1e3)return(x/1e3).toFixed(x>=1e4?0:1).replace(/\.0$/,"")+"K";return String(x);}
const rangeStr=v=>{const x=num(v);return x?comma(x*(1-SPREAD))+" – "+comma(x*(1+SPREAD)):"—";};
function truncate(s,k){s=String(s==null?"":s);return s.length>k?s.slice(0,k-1).trimEnd()+"…":s;}
function names(arr){if(!Array.isArray(arr)||!arr.length)return"—";return truncate(arr.map(i=>typeof i==="string"?i:i.name).filter(Boolean).join(", "),88);}
const focusLabel=f=>({audio:"Streaming audio",ctv:"Connected TV",both:"Audio + CTV"}[f]||"Streaming audio");

/* ---------------------------------------------------------------------------
   PRICING — fixed matrix, channel focus x targeting scope. Must stay in sync
   with PRICING in public/index.html.
--------------------------------------------------------------------------- */
const PRICING = {
  audio: { local:2500, regional:4500, national:6500 },
  ctv:   { local:2900, regional:4800, national:7500 },
  both:  { local:4000, regional:7500, national:10000 }
};
const SCOPE_LABEL = { local:"Local", regional:"Regional", national:"National" };
const FOCUS_LABEL = { audio:"Streaming Audio", ctv:"Connected TV", both:"Audio + Connected TV" };
function priceFor(focus,scope){ return (PRICING[focus]||PRICING.audio)[scope]||PRICING.audio.local; }
/* Rate card: audio $24 CPM, CTV $32 CPM. "Both" is a blended $28 because the
   budget splits across the two. Frequency ~3x. Edit here only. */
const CPM = { audio:24, ctv:32, both:28 };
function planStats(price, focus){
  const cpm = CPM[focus] || CPM.audio;
  const imp = Math.round(price / cpm * 1000);
  return { price, imp, cpm, fans: Math.round(imp / 3) };
}

function generateProposalPdf(d={}, rep={}){
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:"LETTER",margins:{top:TOP,bottom:70,left:ML,right:ML},bufferPages:true,autoFirstPage:false});
    const chunks=[]; doc.on("data",c=>chunks.push(c)); doc.on("end",()=>resolve(Buffer.concat(chunks))); doc.on("error",reject);

    const client=truncate(d.company||d.name||"Your Firm",42);
    const dateStr=new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
    const focus=(d.focus in PRICING)?d.focus:"audio";
    const scope=(d.scope in SCOPE_LABEL)?d.scope:"local";
    const sc={ better: planStats(priceFor(focus,scope), focus) };   // the selected plan
    let y=0, firstPage=true;

    /* ---- logo + headers ---- */
    function logo(x,yy,s){
      /* Real Smart 1 lockup when the server managed to fetch it; the drawn
         mark is only a fallback so the PDF never breaks on a network hiccup. */
      if(rep && rep.logoBuffer){
        try{ doc.image(rep.logoBuffer,x,yy+2*s,{height:20*s}); return; }catch(e){}
      }
      doc.roundedRect(x,yy,22*s,22*s,5*s).fill(CYAN);
      doc.circle(x+11*s,yy+9.5*s,4.6*s).fill(WHITE);
      doc.rect(x+8.6*s,yy+13*s,4.8*s,3.4*s).fill(WHITE);
      const tx=x+30*s, ty=yy+3.5*s;
      doc.font("Helvetica-Bold").fontSize(15*s).fillColor(WHITE).text("SMART",tx,ty,{continued:true});
      doc.fillColor(CYAN).text("1",{continued:true});
      doc.font("Helvetica").fillColor(WHITE).text("MARKETING",{continued:false});
    }
    function fullHeader(){
      doc.rect(0,0,PAGE_W,150).fill(NAVY); doc.rect(0,150,PAGE_W,3).fill(TEAL);
      logo(ML,40,1.1);
      doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(20).text("Stadium to Screen Playbook",ML,82);
      doc.fillColor("#c3d0e6").font("Helvetica").fontSize(10.5).text("College & pro football advertising  ·  your directional media Playbook",ML,112);
    }
    function slimHeader(){
      doc.rect(0,0,PAGE_W,58).fill(NAVY); doc.rect(0,58,PAGE_W,3).fill(TEAL);
      logo(ML,19,0.85);
      doc.fillColor("#c3d0e6").font("Helvetica").fontSize(9.5).text(client,MR-240,26,{width:240,align:"right"});
    }
    doc.on("pageAdded",()=>{ if(firstPage){fullHeader(); y=172; firstPage=false;} else {slimHeader(); y=TOP;} });
    const ensure=h=>{ if(y+h>BOTTOM) doc.addPage(); };

    /* ---- primitives ---- */
    function section(t,reserve){
      ensure((reserve||50)+34);
      doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(9).text(String(t).toUpperCase(),ML,y,{characterSpacing:1.6,width:CW});
      y=doc.y+4; doc.lineWidth(1).strokeColor(RULE).moveTo(ML,y).lineTo(MR,y).stroke(); y+=14;
    }
    function para(text,o={}){
      const size=o.size||9.5;
      ensure(size+8);
      doc.fillColor(o.color||INK).font(o.font||"Helvetica").fontSize(size).text(text,ML,y,{width:CW});
      y=doc.y+(o.gap==null?8:o.gap);
    }
    function infoCard(cells){
      const rows=Math.ceil(cells.length/3), h=18+rows*42;
      ensure(h+14);
      doc.lineWidth(1).roundedRect(ML,y,CW,h,10).fillAndStroke(WHITE,CARDBRD);
      const colW=CW/3;
      cells.forEach((c,i)=>{
        const cx=ML+16+(i%3)*colW, cy=y+15+Math.floor(i/3)*42;
        doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(7.5).text(String(c[0]).toUpperCase(),cx,cy,{characterSpacing:1,width:colW-22});
        /* was truncate(...,22) — "Streaming Audio · Loc…". Shrink to fit instead. */
        const val=String(c[1]||"\u2014");
        doc.font("Helvetica-Bold").fontSize(11);
        let fs=11; while(fs>7.5 && doc.fontSize(fs).widthOfString(val)>colW-24) fs-=0.5;
        doc.fontSize(fs).fillColor(NAVY).text(val,cx,cy+11+(11-fs)*0.5,{width:colW-22,lineBreak:false});
      });
      y+=h+20;
    }
    /* ---------------------------------------------------------------------------
   MEDIA PLAN CHIPS
   The old layout pushed every list into a fixed 170pt right-hand column with a
   hard 19pt row step, so anything longer than a line wrote on top of the next
   row — that's the overlapping text in the report. Lists now wrap as chips
   across the full width, each with its brand colour, and the block grows to fit.
--------------------------------------------------------------------------- */
const BRAND_COLOR={
  spotify:"#1DB954", pandora:"#6C8CFF", iheartradio:"#FF4667", iheart:"#FF4667",
  siriusxm:"#5C7CFF", "sirius xm":"#5C7CFF", audacy:"#FF3D9A", "amazon music":"#25D1DA",
  "apple music":"#FC3C44", tunein:"#2FE0D0", soundcloud:"#FF5500", deezer:"#A238FF",
  hulu:"#1CE783", "amazon prime video":"#00A8E1", "prime video":"#00A8E1",
  "youtube tv":"#FF3D3D", youtube:"#FF3D3D", "paramount+":"#3C7DFF", peacock:"#FFC629",
  espn:"#FF3B4E", "espn+":"#FF3B4E", max:"#5B6BFF", roku:"#A55BEA", tubi:"#FF8A1E",
  "pluto tv":"#F5D400", "sling tv":"#3AB6E8", fubo:"#FA6146", netflix:"#E50914",
  "fox sports":"#1B72E8", "cbs sports":"#0057B8", "nbc sports":"#F5A623",
  "nfl network":"#4B8DF8", "big ten network":"#0B54A4", "sec network":"#004B87",
  "acc network":"#013CA6", tnt:"#E01E5A", "the athletic":"#111111",
  "locked on":"#FF6B35", "the ringer":"#00A9E0", "barstool sports":"#E01A2B",
  "westwood one":"#2E7DD1"
};
function brandColor(name){
  const k=String(name||"").toLowerCase().trim();
  if(BRAND_COLOR[k]) return BRAND_COLOR[k];
  let best=null;
  for(const key in BRAND_COLOR){ if(key.length<3) continue;
    if(k.indexOf(key)>-1 && (!best||key.length>best.length)) best=key; }
  return best?BRAND_COLOR[best]:CYAN;
}

function kvRight(label,value,strong,color){
      ensure(22);
      doc.fillColor(strong?NAVY:INK).font(strong?"Helvetica-Bold":"Helvetica").fontSize(10.5).text(label,ML,y,{width:CW-150});
      doc.fillColor(color||(strong?NAVY:INK)).font("Helvetica-Bold").fontSize(11).text(value,MR-170,y,{width:170,align:"right"});
      y+=19;
    }
    function deviceMini(){
      const items=[["Phones",num(d.estDevicesPhones)||num(d.estDevicesTotal)*0.35],
                   ["Computers",num(d.estDevicesComputers)||num(d.estDevicesTotal)*0.22],
                   ["Tablets",num(d.estDevicesTablets)||num(d.estDevicesTotal)*0.12],
                   ["Conn. TV",num(d.estDevicesCTV)||num(d.estDevicesTotal)*0.31]];
      const max=Math.max(1,...items.map(i=>i[1]));
      ensure(items.length*17+22);
      doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(7.5).text("DEVICE MIX IN SCOPE",ML,y,{characterSpacing:1}); y+=14;
      const x0=ML+92, w=300;
      items.forEach((it,i)=>{ const yy=y+i*17;
        doc.fillColor(INK).font("Helvetica").fontSize(9).text(it[0],ML,yy+1,{width:86});
        doc.roundedRect(x0,yy,w,10,3).fill("#eef2f7");
        doc.roundedRect(x0,yy,Math.max(3,Math.round(it[1]/max*w)),10,3).fill(i%2?TEAL:CYAN);
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(8).text(comma(it[1]),x0+w+8,yy+1.5,{width:70});
      });
      y+=items.length*17+10;
    }
    /* label + wrapped brand chips; height grows with content */
    function mediaBlock(label, items){
      const list=(Array.isArray(items)?items:[]).map(i=>typeof i==="string"?i:(i&&i.name)).filter(Boolean);
      if(!list.length) return;
      const PADX=7, GAP=5, H=15, LH=H+GAP;
      doc.font("Helvetica-Bold").fontSize(8);
      const rows=[]; let row=[], w=0;
      list.forEach(n=>{
        const cw=doc.widthOfString(n)+PADX*2+11;
        if(w+cw>CW && row.length){ rows.push(row); row=[]; w=0; }
        row.push({n,cw}); w+=cw+GAP;
      });
      if(row.length) rows.push(row);
      ensure(14+rows.length*LH+6);
      doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(7.5)
         .text(String(label).toUpperCase(),ML,y,{characterSpacing:1,width:CW});
      y+=12;
      rows.forEach(r=>{
        let x=ML;
        r.forEach(c=>{
          const col=brandColor(c.n);
          doc.lineWidth(.8).roundedRect(x,y,c.cw,H,4).fillAndStroke(WHITE,CARDBRD);
          doc.circle(x+PADX+2.5,y+H/2,2.5).fill(col);
          doc.fillColor(INK).font("Helvetica-Bold").fontSize(8)
             .text(c.n,x+PADX+9,y+4.2,{width:c.cw-PADX-11,lineBreak:false});
          x+=c.cw+GAP;
        });
        y+=LH;
      });
      y+=4;
    }

    /* three side-by-side moments, instead of a bullet list */
    function threeBlocks(items){
      const gap=12, cw=(CW-2*gap)/3, PAD=12;
      doc.font("Helvetica").fontSize(8);
      let h=0;
      items.forEach(it=>{ h=Math.max(h, doc.heightOfString(it[2],{width:cw-PAD*2})); });
      const H=h+46;
      ensure(H+12);
      items.forEach((it,i)=>{
        const x=ML+i*(cw+gap);
        doc.lineWidth(1).roundedRect(x,y,cw,H,9).fillAndStroke("#f7fafd",CARDBRD);
        doc.roundedRect(x,y,cw,3,1.5).fill(i===1?YELLOW:TEAL);
        doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(7)
           .text(it[0].toUpperCase(),x+PAD,y+13,{characterSpacing:1,width:cw-PAD*2});
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9.5)
           .text(it[1],x+PAD,y+25,{width:cw-PAD*2});
        doc.fillColor(INK).font("Helvetica").fontSize(8)
           .text(it[2],x+PAD,y+39,{width:cw-PAD*2});
      });
      y+=H+14;
    }

    function priceCards(){
      const h=150, gap=14, cwc=(CW-2*gap)/3;
      ensure(h+14);
      ["local","regional","national"].forEach((sc,i)=>{
        const x=ML+i*(cwc+gap), on=(sc===scope), st=planStats(priceFor(focus,sc));
        const tc=on?WHITE:NAVY, sub=on?"#bcc9e0":GRAY;
        if(on) doc.roundedRect(x,y,cwc,h,10).fill(NAVY);
        else doc.lineWidth(1).roundedRect(x,y,cwc,h,10).fillAndStroke(WHITE,CARDBRD);
        if(on){ doc.roundedRect(x+cwc-104,y-9,96,18,9).fill(YELLOW);
          doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(7).text("YOUR SELECTION",x+cwc-104,y-4.5,{width:96,align:"center",characterSpacing:.6}); }
        doc.fillColor(sub).font("Helvetica-Bold").fontSize(8).text(SCOPE_LABEL[sc].toUpperCase(),x+16,y+16,{characterSpacing:1.5});
        doc.fillColor(tc).font("Helvetica-Bold").fontSize(23).text(money(st.price),x+16,y+29);
        doc.fillColor(sub).font("Helvetica").fontSize(8.5).text("/ month",x+16,y+57);
        const ly=y+84;
        doc.fillColor(tc).font("Helvetica-Bold").fontSize(12).text("~"+kfmt(st.imp),x+16,ly);
        doc.fillColor(sub).font("Helvetica").fontSize(7.5).text("qualified impressions / mo",x+16,ly+14);
        doc.fillColor(tc).font("Helvetica-Bold").fontSize(12).text("~"+kfmt(st.fans),x+16,ly+30);
        doc.fillColor(sub).font("Helvetica").fontSize(7.5).text("fans reached / mo",x+16,ly+44);
      });
      y+=h+16;
    }
    function note(text){
      const lines=Math.ceil(doc.font("Helvetica").fontSize(9).widthOfString(text)/(CW-30));
      const h=Math.max(40,16+lines*12);
      ensure(h+12);
      doc.lineWidth(1).roundedRect(ML,y,CW,h,8).fillAndStroke("#f4f7fb",CARDBRD);
      doc.roundedRect(ML,y,4,h,2).fill(CYAN);
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(text,ML+16,y+11,{width:CW-30});
      y+=h+16;
    }
    function savingsBox(tradCost,saveM,saveY,ourCost){
      const h=140; ensure(h+14);
      doc.roundedRect(ML,y,CW,h,12).fill(NAVY);
      doc.fillColor("#9fb0cc").font("Helvetica-Bold").fontSize(8.5).text("ESTIMATED EFFICIENCY VS. TRADITIONAL RADIO / TV",ML+22,y+18,{characterSpacing:1.4});
      const iw=(CW-44-14)/2, ix=ML+22, iy=y+40;
      [["ESTIMATED MONTHLY SAVINGS",money(saveM)+" / mo",ix],["ESTIMATED ANNUAL SAVINGS",money(saveY)+" / yr",ix+iw+14]].forEach(b=>{
        doc.roundedRect(b[2],iy,iw,50,8).fill(NAVY_BOX);
        doc.fillColor("#9fb0cc").font("Helvetica-Bold").fontSize(7.5).text(b[0],b[2]+14,iy+9,{characterSpacing:.8,width:iw-24});
        doc.fillColor(YELLOW).font("Helvetica-Bold").fontSize(20).text(b[1],b[2]+14,iy+21);
      });
      doc.fillColor("#c3cfe3").font("Helvetica").fontSize(8.5).text(
        "A comparable traditional radio / TV buy to deliver the same qualified reach runs about "+money(tradCost)+
        "/mo — and roughly two-thirds is wasted on non-fans. Stadium to Screen targets verified football fans only, at "+
        money(ourCost)+"/mo, with every dollar measured. Directional estimate based on typical broadcast CPMs and waste rates.",
        ML+22,iy+60,{width:CW-44});
      y+=h+16;
    }
    function bullets(items){
      items.forEach(t=>{ ensure(22);
        doc.circle(ML+3,y+5,2.4).fill(TEAL);
        doc.fillColor(INK).font("Helvetica").fontSize(9.5).text(t,ML+14,y,{width:CW-14});
        y=doc.y+6; });
      y+=2;
    }
    function numbered(items){
      items.forEach((t,i)=>{ ensure(24);
        doc.circle(ML+9,y+8,9).fill(i<2?CYAN:TEAL);
        doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(9).text(String(i+1),ML,y+3.5,{width:18,align:"center"});
        doc.fillColor(INK).font("Helvetica").fontSize(9.5).text(t,ML+28,y+2,{width:CW-28});
        y=Math.max(doc.y,y+18)+7; });
      y+=2;
    }
    function ctaBox(){
      const h=124; ensure(h+8);
      doc.roundedRect(ML,y,CW,h,12).fill(NAVY);
      doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(17).text("Ready to build your game plan?",ML+24,y+22,{width:CW-48});
      doc.fillColor("#c3cfe3").font("Helvetica").fontSize(10).text(
        "A short consult turns this directional plan into a media plan and budget tailored to your firm — exact inventory, flight dates, and pricing for "+(d.team||"your team")+".",
        ML+24,y+48,{width:CW-48});
      const bw=196,bh=34,bx=ML+24,by=y+h-44;
      doc.roundedRect(bx,by,bw,bh,7).fill(YELLOW);
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text("Schedule your consult",bx,by+11,{width:bw,align:"center"});
      doc.link(bx,by,bw,bh,CONSULT_URL);
      doc.fillColor("#9fb0cc").font("Helvetica").fontSize(9).text("smart1marketing.com/footballmarketingconsult",bx+bw+16,by+12,{width:CW-24-bw-16});
      doc.link(bx+bw+16,by+6,CW-24-bw-16,20,CONSULT_URL);
      y+=h+14;
    }

    /* ================= PAGE 1 ================= */
    doc.addPage();
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(26).text(client,ML,y); y=doc.y+4;
    doc.fillColor(GRAY).font("Helvetica").fontSize(10).text(
      "Prepared for "+truncate(d.name||"your team",40)+"  ·  "+(rep&&rep.name?rep.name+", Smart 1 Marketing":"Smart 1 Marketing")+"  ·  "+dateStr,ML,y);
    y=doc.y+18;

    infoCard([
      ["Team",d.team],["Targeting scope",d.scopeLabel||d.scope],["Channel focus",focusLabel(d.focus)],
      ["Venue",d.venue],["Your plan",FOCUS_LABEL[focus]+" \u00b7 "+SCOPE_LABEL[scope]],["Investment / month",money(sc.better.price)]
    ]);

    /* Audience is presented as a NARROWING FUNNEL: three lines in HOMES, then
       one line in SCREENS with an explicit per-home explanation. The old build
       mixed people, households and whole-market device counts on the same list,
       which made the numbers look like they contradicted each other. */
    section("Your audience (estimated) — "+truncate(d.scopeLabel||"your market",30),160);
    const homes    = num(d.estHomes)          || num(d.estHouseholds);
    const fanHomes = num(d.estFanHomes);
    const reach    = num(d.estReachableHomes);
    const screens  = num(d.estScreens)        || num(d.estMatchable);
    const perHome  = num(d.estScreensPerHome) || (reach ? screens/reach : 0);

    kvRight("1 · Homes in your market",rangeStr(homes));
    if(fanHomes) kvRight("2 · Football-fan homes",rangeStr(fanHomes));
    if(reach)    kvRight("3 · Fan homes we can reach",rangeStr(reach));
    kvRight("4 · Screens inside those homes",rangeStr(screens),true,CYAN);
    kvRight("Your monthly investment",money(sc.better.price)+" / mo",true,GREEN);
    y+=6; deviceMini();
    note("Lines 1-3 count HOMES and get smaller at every step. Line 4 counts SCREENS — the average "
      + "reachable home has about "+(perHome?perHome.toFixed(1):"4")+" connected screens (a TV, phones, a tablet or laptop), "
      + "so the same households give us more places to show your ad. It is not extra households.");
    para("Directional estimate from baseline market data (DMA households) and industry-average device and match-rate assumptions — shown as ranges, not guaranteed delivery. Confirm against current census or ad-platform reach figures before finalizing a budget.",{size:8.5,color:GRAY});

    /* ================= PRICING ================= */
    section("What it costs at each reach",190);
    para("Same "+FOCUS_LABEL[focus].toLowerCase()+" plan, priced by how far you want to reach. Your selection is highlighted.",{gap:12});
    priceCards();
    note("Pricing is per month for the flight you select. Audience figures are estimates for planning, not guaranteed delivery.");

    /* ================= SAVINGS ================= */
    const RELEVANT=0.35, TRAD_CPM=25;
    const tradCost=Math.round(sc.better.imp/RELEVANT/1000*TRAD_CPM/50)*50;
    const saveM=Math.max(0,tradCost-sc.better.price), saveY=saveM*12;
    section("How this saves money vs. traditional advertising",170);
    para("Traditional radio and linear TV charge you to reach an entire market — most of whom will never be your customer. Stadium to Screen pays only to reach verified football fans, and measures every dollar to a click or a lead.",{gap:12});
    savingsBox(tradCost,saveM,saveY,sc.better.price);
    bullets([
      "Targeting: broadcast blankets a whole DMA; we reach verified fans by digital behavior and location — no wasted impressions.",
      "Measurement: radio/TV is estimated and unattributed; every Stadium to Screen impression is tracked to completion and to banner clicks.",
      "Actionability: a radio ad can't be clicked; our audio runs beside a clickable companion banner that drives immediate, trackable web traffic.",
      "Agility: instead of one expensive spot on repeat all season, creative is swapped by day of the week to match the fan's mindset."
    ]);

    /* ================= MEDIA PLAN + INCLUDED ================= */
    if(d.recommendations){
      const r=d.recommendations;
      section("Matched media plan",150);
      mediaBlock("Streaming", r.streamingServices);
      if(Array.isArray(r.podcasts)&&r.podcasts.length){
        const localPods=r.podcasts.filter(p=>p&&p.local), natPods=r.podcasts.filter(p=>!p||!p.local);
        if(localPods.length) mediaBlock("Podcasts we are targeting \u2014 local & team", localPods);
        if(natPods.length)   mediaBlock("Podcasts we are targeting \u2014 national", natPods);
      }
      mediaBlock("Sports networks", r.sportsNetworks);
      mediaBlock("Related audiences", r.relatedAudiences);
      y+=6;
    }

    const wantAudio=d.focus==="audio"||d.focus==="both", wantCtv=d.focus==="ctv"||d.focus==="both";
    const inc=[];
    if(wantAudio) inc.push("3 custom audio commercials (:15 / :30) tuned to the game-week flow");
    if(wantCtv)   inc.push("Premium :15 / :30 CTV video on top-tier streaming inventory");
    inc.push("Clickable 300x250 companion banners running alongside every audio spot");
    inc.push("Targeting across premium streaming platforms and top sports podcast networks");
    inc.push("Venue Replay stadium geo-fencing with post-game retargeting");
    inc.push("One clear monthly report on the program \u2014 delivery, completion rate and banner clicks");
    section("What's included",90);
    bullets(inc);

    section("Why this beats a game-day buy",210);
    para("Most football advertising is one of two mistakes: buying game day only \u2014 one spot, one moment, gone \u2014 or running all day every day and paying to reach people who will never buy. We do neither.",{gap:12});
    threeBlocks([
      ["Before the game","They're planning",
       "Pre-game shows and sports talk while fans decide where to eat, watch and spend. This is where intent gets formed."],
      ["Game Day","They're locked in",
       "Premium video and audio around live coverage and halftime, with your brand beside the thing they care about most."],
      ["After the game","They're deciding",
       "Recaps, Monday sports talk and the commute home, retargeting the same households while the weekend is still fresh."]
    ]);
    para("Same verified fans, three moments, three messages \u2014 instead of shouting once and hoping, or paying to reach everybody. Game Day placements are subject to inventory available in your market at the time of booking.",{size:8.5,color:GRAY,gap:14});

    section("Recommended next steps",90);
    numbered([
      "Book a short consult so we can confirm your goals, market, and margins.",
      "We right-size the media plan and budget to your firm — you're not locked into a tier.",
      "We produce the creative and stand up tracking before a single dollar runs.",
      "You get one clear monthly report on the program."
    ]);

    ctaBox();
    para("Suggested, directional figures based on information supplied. Audience and savings numbers are planning estimates, not guaranteed delivery. Final budget, inventory, and pricing are tailored on consult.",{size:8,color:GRAYL,gap:0});

    /* ================= FOOTERS =================
       BUGFIX: the footer sits at y=760, which is BELOW the 70pt bottom margin
       (content stops at 722). PDFKit treats that as an overflow and silently
       appends a fresh page for every footer it draws — the old build shipped a
       3-page Playbook padded out to 9 pages, 6 of them blank, with the page
       numbers reading "1 / 3" on page 5. Zeroing the bottom margin while the
       footers are drawn keeps everything on the page it belongs to. */
    const range=doc.bufferedPageRange();
    const total=range.count;
    for(let i=0;i<total;i++){
      doc.switchToPage(range.start+i);
      const keepBottom=doc.page.margins.bottom;
      doc.page.margins.bottom=0;                     // <- stops the phantom pages
      doc.lineWidth(1).strokeColor(RULE).moveTo(ML,752).lineTo(MR,752).stroke();
      doc.fillColor(GRAYL).font("Helvetica").fontSize(7.5).text(
        "Smart 1 Marketing \u00b7 smart1marketing.com \u00b7 Stadium Marketing Plan",
        ML,760,{width:CW-46,lineBreak:false});
      doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(8).text(
        (i+1)+" / "+total,MR-46,760,{width:46,align:"right",lineBreak:false});
      doc.page.margins.bottom=keepBottom;
    }
    doc.end();
  });
}
module.exports = { generateProposalPdf };
