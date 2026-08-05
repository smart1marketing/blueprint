/* Generates the Stadium to Screen proposal PDF as a Buffer (pdfkit).
   Styled after the Smart 1 "Marketing Efficiency Audit" report:
   branded navy header/footer, info card, audience sizing (ranges),
   good/better/best pricing scaled to fan base, savings-vs-traditional,
   budget disclaimers, and a closing consult CTA. */
const PDFDocument = require("pdfkit");

/* palette */
const NAVY="#17284d", NAVY_BOX="#22345c", INK="#2b3547", GRAY="#8a94a3", GRAYL="#a9b2c0",
      RULE="#dfe4ec", CARDBRD="#e6eaf1", TEAL="#2fd0c0", CYAN="#29b6e8",
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

/* pricing scenarios scaled to fan base */
function scenarios(fanBase){
  const f=num(fanBase); let t;
  if(f<150000)      t=[2500,3500,5000];
  else if(f<350000) t=[3000,4500,6500];
  else if(f<750000) t=[4500,6500,9500];
  else if(f<1500000)t=[6500,9500,14000];
  else if(f<4000000)t=[9500,14000,20000];
  else              t=[14000,20000,30000];
  const CPM=20, FREQ=3;
  const mk=p=>{const imp=Math.round(p/CPM*1000);return{price:p,imp,fans:Math.round(imp/FREQ)};};
  return {good:mk(t[0]),better:mk(t[1]),best:mk(t[2])};
}

function generateProposalPdf(d={}, rep={}){
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:"LETTER",margins:{top:TOP,bottom:70,left:ML,right:ML},bufferPages:true,autoFirstPage:false});
    const chunks=[]; doc.on("data",c=>chunks.push(c)); doc.on("end",()=>resolve(Buffer.concat(chunks))); doc.on("error",reject);

    const client=truncate(d.company||d.name||"Your Firm",42);
    const dateStr=new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
    const fan=num(d.estFanBase), sc=scenarios(fan);
    let y=0, firstPage=true;

    /* ---- logo + headers ---- */
    function logo(x,yy,s){
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
      doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(20).text("Stadium to Screen Proposal",ML,82);
      doc.fillColor("#c3d0e6").font("Helvetica").fontSize(10.5).text("College & pro football advertising  ·  a directional media plan prepared for review",ML,112);
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
      const rows=Math.ceil(cells.length/3), h=16+rows*40;
      ensure(h+14);
      doc.lineWidth(1).roundedRect(ML,y,CW,h,10).fillAndStroke(WHITE,CARDBRD);
      const colW=CW/3;
      cells.forEach((c,i)=>{
        const cx=ML+16+(i%3)*colW, cy=y+15+Math.floor(i/3)*40;
        doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(7.5).text(String(c[0]).toUpperCase(),cx,cy,{characterSpacing:1,width:colW-22});
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text(truncate(c[1]||"—",22),cx,cy+11,{width:colW-22});
      });
      y+=h+20;
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
    function priceCards(){
      const h=178, gap=14, cwc=(CW-2*gap)/3;
      ensure(h+14);
      const tiers=[["Good",sc.good,"Core game-week audio flow",false],
                   ["Better",sc.better,"Audio + CTV + companion banners",true],
                   ["Best",sc.best,"Full multi-screen + Venue Replay",false]];
      tiers.forEach((t,i)=>{
        const x=ML+i*(cwc+gap), rec=t[3], tc=rec?WHITE:NAVY, sub=rec?"#bcc9e0":GRAY;
        if(rec) doc.roundedRect(x,y,cwc,h,10).fill(NAVY);
        else doc.lineWidth(1).roundedRect(x,y,cwc,h,10).fillAndStroke(WHITE,CARDBRD);
        if(rec){ doc.roundedRect(x+cwc-96,y-9,88,18,9).fill(YELLOW);
          doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(7).text("RECOMMENDED",x+cwc-96,y-4.5,{width:88,align:"center",characterSpacing:.6}); }
        doc.fillColor(sub).font("Helvetica-Bold").fontSize(8).text(t[0].toUpperCase(),x+16,y+16,{characterSpacing:1.5});
        doc.fillColor(tc).font("Helvetica-Bold").fontSize(23).text(money(t[1].price),x+16,y+29);
        doc.fillColor(sub).font("Helvetica").fontSize(8.5).text("/ month",x+16,y+57);
        doc.fillColor(rec?"#d7e0ef":INK).font("Helvetica").fontSize(9).text(t[2],x+16,y+74,{width:cwc-30});
        const ly=y+112;
        doc.fillColor(tc).font("Helvetica-Bold").fontSize(12).text("~"+kfmt(t[1].imp),x+16,ly);
        doc.fillColor(sub).font("Helvetica").fontSize(7.5).text("qualified impressions / mo",x+16,ly+14);
        doc.fillColor(tc).font("Helvetica-Bold").fontSize(12).text("~"+kfmt(t[1].fans),x+16,ly+30);
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
      ["Venue",d.venue],["Recommended package",d.recommendedPackage],["Suggested / month",money(sc.better.price)]
    ]);

    section("Estimated reachable audience — "+truncate(d.scopeLabel||"your market",30),150);
    kvRight("Reachable fan base",rangeStr(d.estFanBase));
    kvRight("Households in scope",rangeStr(d.estHouseholds));
    kvRight("Matchable programmatic audience (devices)",rangeStr(d.estMatchable));
    kvRight("Suggested monthly investment (recommended tier)",money(sc.better.price)+" / mo",true,GREEN);
    y+=6; deviceMini();
    para("Directional estimate from baseline market data (DMA households / population) and industry-average device and match-rate assumptions — shown as ranges, not guaranteed delivery. Confirm against current census or ad-platform reach figures before finalizing a budget.",{size:8.5,color:GRAY});

    /* ================= PRICING ================= */
    section("Suggested investment scenarios — good / better / best",210);
    para("Three ways to enter, scaled to your "+(d.team||"team")+" fan base. A larger, more passionate audience justifies more reach and frequency across the game-week flow — so the suggested budget grows with it. The middle tier is where most advertisers see the strongest return.",{gap:12});
    priceCards();
    note("This is a suggested budget based on your fan base — not a fixed quote. On a quick consult we tailor a plan and budget that fit your firm's goals, margins, and season. You're never locked into these tiers.");

    /* ================= SAVINGS ================= */
    const RELEVANT=0.35, TRAD_CPM=25;
    const tradCost=Math.round(sc.better.imp/RELEVANT/1000*TRAD_CPM/50)*50;
    const saveM=Math.max(0,tradCost-sc.better.price), saveY=saveM*12;
    section("How this saves money vs. traditional advertising",170);
    para("Traditional radio and linear TV charge you to reach an entire market — most of whom will never be your customer. Stadium to Screen pays only to reach verified football fans, and measures every dollar to a click or a lead.",{gap:12});
    savingsBox(tradCost,saveM,saveY,sc.better.price);
    bullets([
      "Targeting: broadcast blankets a whole DMA; we reach verified fans by digital behavior and location — no wasted impressions.",
      "Measurement: radio/TV is estimated and unattributed; every Stadium to Screen impression is tracked to completion, banner clicks, and cost per acquisition.",
      "Actionability: a radio ad can't be clicked; our audio runs beside a clickable companion banner that drives immediate, trackable web traffic.",
      "Agility: instead of one expensive spot on repeat all season, creative is swapped by day of the week to match the fan's mindset."
    ]);

    /* ================= MEDIA PLAN + INCLUDED ================= */
    if(d.recommendations){
      const r=d.recommendations;
      section("Matched media plan",100);
      kvRight("Streaming",names(r.streamingServices));
      if(Array.isArray(r.podcasts)&&r.podcasts.length) kvRight("Podcasts",names(r.podcasts));
      kvRight("Sports networks",names(r.sportsNetworks));
      kvRight("Related audiences",names(r.relatedAudiences));
      y+=8;
    }

    const wantAudio=d.focus==="audio"||d.focus==="both", wantCtv=d.focus==="ctv"||d.focus==="both";
    const inc=[];
    if(wantAudio) inc.push("3 custom audio commercials (:15 / :30) tuned to the game-week flow");
    if(wantCtv)   inc.push("Unskippable :15 / :30 CTV video on premium streaming inventory");
    inc.push("Clickable 300x250 companion banners running alongside every audio spot");
    inc.push("Targeting across premium streaming platforms and top sports podcast networks");
    inc.push("Venue Replay stadium geo-fencing with Sunday / Monday retargeting (Champion / Championship tiers)");
    inc.push("Full performance reporting: audio completion rate, banner CTR, and cost per acquisition");
    section("What's included",90);
    bullets(inc);

    section("Recommended next steps",90);
    numbered([
      "Book a short consult so we can confirm your goals, market, and margins.",
      "We right-size the media plan and budget to your firm — you're not locked into a tier.",
      "We produce the creative and stand up tracking before a single dollar runs.",
      "You get one clear monthly report tying spend to leads."
    ]);

    ctaBox();
    para("Suggested, directional figures based on information supplied. Audience and savings numbers are planning estimates, not guaranteed delivery. Final budget, inventory, and pricing are tailored on consult.",{size:8,color:GRAYL,gap:0});

    /* ================= FOOTERS ================= */
    const range=doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){
      doc.switchToPage(i);
      doc.lineWidth(1).strokeColor(RULE).moveTo(ML,752).lineTo(MR,752).stroke();
      doc.fillColor(GRAYL).font("Helvetica").fontSize(7.5).text(
        "Smart 1 Marketing  ·  Directional media plan based on information supplied. Figures are estimates; budgets are tailored on consult.",
        ML,760,{width:CW-46});
      doc.fillColor(GRAY).font("Helvetica-Bold").fontSize(8).text((i+1)+" / "+range.count,MR-46,760,{width:46,align:"right"});
    }
    doc.end();
  });
}
module.exports = { generateProposalPdf };
