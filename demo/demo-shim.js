(function(){

  var DEMOFC=(function(){ var F=[],lon0=55.74,lat0=24.20;
    function rect(x,y,w,h){ return [[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]; }
    function circle(cx,cy,r){ var c=[]; for(var i=0;i<=32;i++){ var a=i/32*2*Math.PI; c.push([cx+r*Math.cos(a)/Math.cos(cy*Math.PI/180),cy+r*Math.sin(a)]); } return [c]; }
    for(var i=0;i<6;i++) F.push({type:'Feature',properties:{Farm_Name:'GH-0'+(i+1),Farm_Code:'MH-GH-0'+(i+1),ZONE_ID:'MH',Structure_Type:'Greenhouse'},geometry:{type:'Polygon',coordinates:rect(lon0+i*0.0016,lat0,0.0012,0.0035)}});
    for(var j=0;j<3;j++) F.push({type:'Feature',properties:{Farm_Name:'NH-0'+(j+1),Farm_Code:'MH-NH-0'+(j+1),ZONE_ID:'MH',Structure_Type:'NetHouse'},geometry:{type:'Polygon',coordinates:rect(lon0+j*0.0024,lat0+0.0045,0.002,0.003)}});
    F.push({type:'Feature',properties:{Farm_Name:'OF-01',Farm_Code:'MH-OF-01',ZONE_ID:'MH',Structure_Type:'Open Field'},geometry:{type:'Polygon',coordinates:rect(lon0+0.0105,lat0,0.006,0.0075)}});
    F.push({type:'Feature',properties:{Farm_Name:'OF-02',Farm_Code:'MH-OF-02',ZONE_ID:'MH',Structure_Type:'Open Field'},geometry:{type:'Polygon',coordinates:rect(lon0,lat0-0.0085,0.0095,0.0065)}});
    F.push({type:'Feature',properties:{Farm_Name:'PV-01',Farm_Code:'MH-PV-01',ZONE_ID:'MH',Structure_Type:'Pivot'},geometry:{type:'Polygon',coordinates:circle(lon0+0.0145,lat0-0.0055,0.0035)}});
    F.push({type:'Feature',properties:{Farm_Name:'PV-02',Farm_Code:'MH-PV-02',ZONE_ID:'MH',Structure_Type:'Pivot'},geometry:{type:'Polygon',coordinates:circle(lon0+0.0225,lat0-0.0055,0.0035)}});
    return {type:'FeatureCollection',features:F}; })();
  var SATCAT=[{"key":"TRUE_COLOR","label":"True color","group":"visual","formula":"B04, B03, B02","description":"Natural colours, as the eye sees them.","legend":null,"visual":true},{"key":"FALSE_COLOR","label":"Color infrared (vegetation)","group":"visual","formula":"B08, B04, B03","description":"Healthy vegetation in bright red.","legend":null,"visual":true},{"key":"SWIR","label":"SWIR (soil & moisture)","group":"visual","formula":"B12, B8A, B04","description":"Wet soil dark, dry soil and bare ground bright.","legend":null,"visual":true},{"key":"NDVI","label":"NDVI","group":"vegetation","formula":"(B08 − B04) / (B08 + B04)","description":"Vegetation health and density.","legend":[{"value":-0.2,"color":"#a50026"},{"value":0,"color":"#d73027"},{"value":0.1,"color":"#f46d43"},{"value":0.2,"color":"#fdae61"},{"value":0.3,"color":"#fee08b"},{"value":0.4,"color":"#d9ef8b"},{"value":0.5,"color":"#a6d96a"},{"value":0.6,"color":"#66bd63"},{"value":0.7,"color":"#1a9850"},{"value":0.9,"color":"#006837"}],"visual":false},{"key":"SAVI","label":"SAVI","group":"vegetation","formula":"1.5 × (B08 − B04) / (B08 + B04 + 0.5)","description":"NDVI corrected for bright soil; better for young crops.","legend":[{"value":-0.2,"color":"#a50026"},{"value":0,"color":"#d73027"},{"value":0.1,"color":"#f46d43"},{"value":0.2,"color":"#fdae61"},{"value":0.3,"color":"#fee08b"},{"value":0.4,"color":"#d9ef8b"},{"value":0.5,"color":"#a6d96a"},{"value":0.6,"color":"#66bd63"},{"value":0.7,"color":"#1a9850"},{"value":0.9,"color":"#006837"}],"visual":false},{"key":"NDWI","label":"NDWI","group":"water","formula":"(B03 − B08) / (B03 + B08)","description":"Open water and water bodies.","legend":[{"value":-0.8,"color":"#8c510a"},{"value":-0.4,"color":"#d8b365"},{"value":-0.1,"color":"#f6e8c3"},{"value":0,"color":"#c7eae5"},{"value":0.2,"color":"#5ab4ac"},{"value":0.5,"color":"#01665e"},{"value":0.8,"color":"#003c30"}],"visual":false},{"key":"NDMI","label":"NDMI","group":"water","formula":"(B08 − B11) / (B08 + B11)","description":"Moisture in the crop canopy.","legend":[{"value":-0.6,"color":"#8c2d04"},{"value":-0.3,"color":"#cc4c02"},{"value":-0.1,"color":"#fe9929"},{"value":0,"color":"#fee391"},{"value":0.1,"color":"#c7e9b4"},{"value":0.2,"color":"#7fcdbb"},{"value":0.4,"color":"#2c7fb8"},{"value":0.6,"color":"#253494"}],"visual":false},{"key":"NDII","label":"NDII","group":"water","formula":"(B08 − B11) / (B08 + B11)","description":"Infrared water-content index (same Sentinel-2 bands as NDMI).","legend":[{"value":-0.6,"color":"#8c2d04"},{"value":-0.3,"color":"#cc4c02"},{"value":-0.1,"color":"#fe9929"},{"value":0,"color":"#fee391"},{"value":0.1,"color":"#c7e9b4"},{"value":0.2,"color":"#7fcdbb"},{"value":0.4,"color":"#2c7fb8"},{"value":0.6,"color":"#253494"}],"visual":false},{"key":"MSI","label":"Moisture stress (MSI)","group":"water","formula":"B11 / B08","description":"Higher values mean drier, stressed plants.","legend":[{"value":0.2,"color":"#253494"},{"value":0.6,"color":"#41b6c4"},{"value":1,"color":"#ffffcc"},{"value":1.4,"color":"#fd8d3c"},{"value":2,"color":"#bd0026"}],"visual":false},{"key":"BSI","label":"Bare soil (BSI)","group":"soil","formula":"((B11 + B04) − (B08 + B02)) / ((B11 + B04) + (B08 + B02))","description":"Bare and exposed soil.","legend":[{"value":-0.6,"color":"#1a9850"},{"value":-0.2,"color":"#91cf60"},{"value":0,"color":"#fee08b"},{"value":0.15,"color":"#fc8d59"},{"value":0.3,"color":"#d73027"},{"value":0.6,"color":"#7f0000"}],"visual":false}];
  try {
    var U={id:'u1',name:'Demo Manager',email:'demo@agrocloud.test',role:'ceo',organizationId:'org1'};
    if(!localStorage.getItem('almaha_user') || localStorage.getItem('almaha_access_token')==='demo-token'){
      localStorage.setItem('almaha_user',JSON.stringify(U));
      localStorage.setItem('almaha_access_token','demo-token');
      localStorage.setItem('almaha_refresh_token','demo-refresh');
      if(!localStorage.getItem('i18nextLng')) localStorage.setItem('i18nextLng','ar');
    }
  } catch(e){}
  var ZONES=[['AD',['Default Site','Site 1','Site 2']],['AF',['Default Site','Site 2']],['AL AIN',['AL Ain']],['AM',['Default Site','Site 3']],['BH',['Site 3']],['DB',['Default Site','Site 3']],['KE',['Site 3']],['MH',['Default Site','Site 1']]];
  var countries=[],sites=[],areas=[],fields=[];
  ZONES.forEach(function(z,zi){
    var cid='c'+zi; countries.push({id:cid,name:z[0],code:z[0]});
    z[1].forEach(function(sn,si){
      var sid=cid+'s'+si; sites.push({id:sid,name:sn,countryId:cid,country_id:cid,location:z[0]});
      ['Greenhouse','Nethouse'].forEach(function(an,ai){
        var aid=sid+'a'+ai; areas.push({id:aid,name:an,siteId:sid,site_id:sid});
        for(var k=1;k<=3;k++){ var fid=aid+'f'+k; fields.push({id:fid,name:(ai?'NH-0':'GH-0')+k,farmAreaId:aid,farm_area_id:aid,area:1.2,gis_zone_id:z[0],gis_farm_code:z[0]+'-'+(ai?'NH':'GH')+'-0'+k}); }
      });
    });
  });
  var CROPS=['Tomato','Cucumber','Pepper','Lettuce','Strawberry','Eggplant','Zucchini','Melon'];
  var NAMES=['GH-01','GH-02','GH-03','NH-01','NH-02','NH-03','GH-01','GH-02'];
  var ST=['approved','pending','approved','rejected','approved','pending','approved','approved'];
  var ROWS=NAMES.map(function(n,i){return {id:'r'+(i+1),name:n,code:'C-'+(100+i),title:'Record '+(i+1),
    date:'2026-10-'+(20+i),application_date:'2026-10-'+(20+i),scouting_date:'2026-10-'+(18+i),report_date:'2026-10-'+(18+i),phi_end_date:'2026-10-'+(23+i),
    created_at:'2026-10-'+(20+i)+'T08:00:00Z',updated_at:'2026-10-'+(20+i)+'T09:00:00Z',
    site_id:'c7s1',siteId:'c7s1',site_name:'Site 1',field_id:'c7s1a0f1',fieldId:'c7s1a0f1',field_name:n,
    crop:CROPS[i],crop_name:CROPS[i],variety:'Standard',quantity:120+i*13,amount:40+i*3,value:12+i,total:300+i*20,
    product_name:['Movento 150 OD','Actara 25 WG','Confidor'][i%3],active_ingredient:'Spirotetramat',total_quantity_applied:7.5,cost:1350+i*40,
    dosage:0.5,rate_per_ha:750,uom:'L',phi_days:3,operator_name:'Ahmed Ali',approval_status:ST[i],status:ST[i],application_start_time:'06:30',application_end_time:'08:00',machinery_used:'Sprayer 2000L',
    role:'worker',email:'user'+i+'@farm.test',ec_in:2.1,ph_in:6.1,ec_out:2.6,ph_out:6.4,drain:28+i,temperature:30+i,humidity:50+i,notes:'Routine check',unit:'kg',category:'Fertilizer',is_active:true,count:i+2};});
  var SEASONS=[{id:'season1',name:'2025-2026',status:'open',start_date:'2025-09-01',end_date:'2026-12-31',startDate:'2025-09-01',endDate:'2026-12-31'}];
  var REPORT={url:'',layer:{name:'Agro_Structures',featureCount:412,geometryType:'esriGeometryPolygon',globalIdField:'GlobalID',editable:false,
    fields:['OBJECTID','ProjectCode','Country','ZONE_ID','SITE','Site_Code','Farm_Code','Farm_Name','Structure_Type','Category','Status','Area_ha','GlobalID'].map(function(n){return {name:n,alias:n,type:n==='OBJECTID'?'OID':'String'};}),types:[]},
    mapping:{globalId:'GlobalID',zoneId:'ZONE_ID',farmCode:'Farm_Code',farmName:'Farm_Name',site:'SITE',siteCode:'Site_Code',structureType:'Structure_Type'},
    keyRoles:[{role:'globalId',label:'Global ID (stable feature id)',required:true},{role:'zoneId',label:'Zone',required:true},{role:'farmCode',label:'Farm code',required:true},
      {role:'farmName',label:'Farm / structure name',required:false},{role:'site',label:'Site',required:false},{role:'siteCode',label:'Site code',required:false},{role:'structureType',label:'Structure type',required:false}],
    keys:{duplicates:[{zone:'DB',farmCode:'DB-GH-07',count:2}],duplicateCount:1,uniqueKeys:409,missingZone:0,missingFarmCode:0,notApplicableSiteCode:'3',
      zones:ZONES.map(function(z,i){return {value:z[0],count:60-i*5};}),sites:[{value:'1 · Site 1',count:220},{value:'2 · Site 2',count:120},{value:'3 · Not Applicable',count:72}],
      structureTypes:[{value:'Greenhouse',count:180},{value:'Nethouse',count:120},{value:'Farm Plots',count:70},{value:'PIVOT',count:42}]},
    agroCloud:{matchedByGlobalId:371,matchedByKey:0,unmatched:41,zonesOnlyInLayer:[],zonesOnlyInAgroCloud:[]},
    checks:[],ok:true,inspectedAt:new Date().toISOString()};
  var CONN=[]; var AICONV=[]; var AIMSG={};
  function ok(data,extra){var o={success:true,data:data}; if(extra) for(var k in extra) o[k]=extra[k]; return o;}
  function body(url,method,reqBody){
    var path=url.replace(/^https?:\/\/[^/]+/,'').replace(/^.*\/api\/v1/,'').split('?')[0];
    var q={}; (url.split('?')[1]||'').split('&').forEach(function(p){var kv=p.split('='); if(kv[0]) q[decodeURIComponent(kv[0])]=decodeURIComponent(kv[1]||'');});
    if(/^\/auth\/(me|profile|refresh|verify)/.test(path)) return {success:true,data:U,user:U,accessToken:'demo-token',token:'demo-token'};



    if(path==='/soil-grids/point'){ var la=Number(q.lat),lo=Number(q.lon),dps=(q.depths||'0,30,60').split(',').map(Number); var wv=function(b,a){return Math.round((b+a*Math.sin(la*37+lo*11))*10)/10;};
      var mk=function(key,prop,unit,f){ var r={key:key,property:prop,unit:unit}; dps.forEach(function(d,i){ r[d+'cm']=f(d,i); }); return r; };
      return ok({lat:la,lon:lo,depths:dps,source:'OpenLandMap (OpenGeoHub) · 250 m · demo values',rows:[
        mk('ph','Soil pH (H2O)','pH',function(d){return wv(8.0+d/200,0.2);}),
        mk('organic_carbon','Organic carbon','g/kg',function(d){return Math.max(0,Math.round((6-d/25)*5)/5*5)/5;}),
        mk('clay','Clay','%',function(d){return Math.round(wv(9+d/20,2));}),
        mk('sand','Sand','%',function(d){return Math.round(wv(78-d/15,4));}),
        mk('bulk_density','Bulk density','kg/m³',function(d){return Math.round(wv(1520+d,30));}),
        mk('water_33kpa','Water at field capacity (33 kPa)','% vol',function(d){return Math.round(wv(14+d/30,2));}),
        mk('texture','Texture class (USDA)','',function(d){return d<60?'Loamy sand':'Sandy loam';})]}); }

    if(path==='/gis/layers'&&method==='GET') return ok([{id:'demo-struct',name:'Agro_Structures (demo)',sourceType:'arcgis',featureCount:DEMOFC.features.length,isVisible:true,style:{color:'#1f7a4d',fillOpacity:0.25}}]);
    if(path==='/gis/layers/demo-struct/features') return ok(DEMOFC);
    if(path==='/satellite/status') return ok({configured:true,service:'sentinel-hub',label:'Public Data (featured collections) · demo'});
    if(path==='/satellite/indices') return ok(SATCAT);
    if(path==='/satellite/tile-key') return ok({key:'demo.key',expiresAt:new Date(Date.now()+12*3600e3).toISOString()});
    if(path==='/satellite/scenes'){ var sc=[],d0=new Date(q.to||Date.now()); for(var si=0;si<8;si++){ var dd=new Date(d0.getTime()-si*5*864e5); var cc=[3,12,0,27,8,41,5,16][si]; if(cc<=Number(q.maxcc||100)) sc.push({date:dd.toISOString().slice(0,10),cloud:cc,tiles:2,time:null}); } return ok(sc); }
    if(path==='/satellite/stats'){ var st=[],a=new Date(reqBody.from),b=new Date(reqBody.to); for(var tt=a.getTime(),n=0;tt<=b.getTime();tt+=5*864e5,n++){ var base={NDVI:0.55,SAVI:0.4,NDWI:-0.45,NDMI:0.18,NDII:0.18,MSI:0.8,BSI:-0.1}[reqBody.index]||0.3; var m=base+0.08*Math.sin(n/2)+0.02*((n*7)%3-1); st.push({date:new Date(tt).toISOString().slice(0,10),mean:Math.round(m*1000)/1000,min:Math.round((m-0.25)*1000)/1000,max:Math.round((m+0.2)*1000)/1000}); } return ok(st); }
    if(path==='/settings/sentinelhub') return ok({configured:true,idMasked:'60de••••-••••-56fa',service:'sentinel-hub',label:'Public Data (featured collections)'});
    if(path==='/ai/status') return ok({configured:true,provider:'demo',model:'demo'});
    if(path==='/ai/conversations') return ok(AICONV);
    if(/^\/ai\/conversations\/[^/]+\/messages$/.test(path)){ var cid=path.split('/')[3]; return ok(AIMSG[cid]||[]); }
    if(/^\/ai\/conversations\/[^/]+$/.test(path)&&method==='DELETE'){ var did=path.split('/')[3]; AICONV=AICONV.filter(function(c){return c.id!==did;}); return ok(null); }
    if(path==='/ai/ask'){
      var t=(reqBody&&reqBody.text||''), ar=/[؀-ۿ]/.test(t), cidA=reqBody&&reqBody.conversationId;
      if(!cidA){ cidA='demo-'+Date.now(); AICONV.unshift({id:cidA,title:t.slice(0,60),updated_at:new Date().toISOString()}); AIMSG[cidA]=[]; }
      var HF={form_id:'7c774b7b-8363-5887-b013-736ed63651b8',form_key:'harvest.entry',title_en:'Harvest Entry',title_ar:'إدخال الحصاد'};
      var PF={form_id:'9d7636be-db18-5857-811d-afafda3efde8',form_key:'ipm.pesticide_spray',title_en:'Pesticide — Spray',title_ar:'المبيدات — رش'};
      var msg;
      if(/حصاد|harvest/i.test(t)){
        var rows=[{zone:'MH',field:'GH-01',sum_total_quantity:800,records:12},{zone:'MH',field:'GH-02',sum_total_quantity:450,records:9},{zone:'AD',field:'NH-01',sum_total_quantity:320,records:6},{zone:'AD',field:'NH-02',sum_total_quantity:210,records:4}];
        msg={content: ar?'إجمالي الحصاد في **أكتوبر 2026** بلغ **1,780 كجم** من 4 حقول. أعلى حقل **GH-01** (800 كجم).\n\n- المصدر: استمارة إدخال الحصاد\n- الفترة: 1–31 أكتوبر':'Total harvest in **October 2026** was **1,780 kg** from 4 fields; highest **GH-01** (800 kg).',
          artifacts:[{kind:'table',title:ar?'الحصاد لكل حقل — أكتوبر 2026':'Harvest per field — October 2026',columns:['zone','field','sum_total_quantity','records'],rows:rows,total:4,chart:{type:'bar',x:'field',y:['sum_total_quantity']},form:HF}],sources:[HF]};
      } else if(/مبيد|تكلفة|pesticide|cost/i.test(t)){
        var rows2=[{site:'MH · Site 1',sum_cost:4210,records:6},{site:'AD · Site 1',sum_cost:2890,records:4},{site:'AF · Site 2',sum_cost:1350,records:2}];
        msg={content: ar?'تكلفة المبيدات هذا الموسم **8,450** موزعة على 3 مواقع، أعلاها **MH · Site 1**.':'Pesticide cost this season is **8,450** across 3 sites; highest **MH · Site 1**.',
          artifacts:[{kind:'table',title:ar?'تكلفة المبيدات لكل موقع — موسم 2025-2026':'Pesticide cost per site — 2025-2026',columns:['site','sum_cost','records'],rows:rows2,total:3,chart:{type:'pie',x:'site',y:['sum_cost']},form:PF}],sources:[PF]};
      } else if(/فترة ما قبل الحصاد|phi/i.test(t)){
        var rows3=[{field:'GH-02',product_name:'Actara 25 WG',phi_end_date:'2026-11-10'},{field:'NH-01',product_name:'Movento 150 OD',phi_end_date:'2026-11-09'}];
        msg={content: ar?'يوجد **حقلان** ضمن فترة ما قبل الحصاد الآن؛ لا تحصد منهما قبل التواريخ في الجدول.':'**2 fields** are inside an active PHI now; do not harvest them before the dates shown.',
          artifacts:[{kind:'table',title:ar?'الحقول ضمن فترة ما قبل الحصاد':'Fields inside an active PHI',columns:['field','product_name','phi_end_date'],rows:rows3,total:2,chart:null,form:PF}],sources:[PF]};
      } else if(/خصائص التربة|قوام|ph|كربون|texture|soil propert|openlandmap/i.test(t)){
        var rows5=[{property:'Soil pH (H2O)',unit:'pH','0cm':8.1,'30cm':8.2,'60cm':8.3},{property:'Organic carbon',unit:'g/kg','0cm':5,'30cm':3,'60cm':2},{property:'Clay',unit:'%','0cm':9,'30cm':11,'60cm':12},{property:'Sand',unit:'%','0cm':78,'30cm':76,'60cm':74},{property:'Bulk density',unit:'kg/m³','0cm':1520,'30cm':1550,'60cm':1580},{property:'Water at field capacity (33 kPa)',unit:'% vol','0cm':14,'30cm':15,'60cm':16},{property:'Texture class (USDA)',unit:'','0cm':'Loamy sand','30cm':'Loamy sand','60cm':'Sandy loam'}];
        msg={content: ar?'تربة الحقل **GH-01** رملية طميية، قلوية قليلاً (**pH 8.1**) وفقيرة بالكربون العضوي (**5 g/kg**)، والسعة الحقلية منخفضة (**14%**) — الري المتقارب بكميات صغيرة أنسب.\n\n- المصدر: خرائط التربة العالمية OpenLandMap (250 م) — قيم تقديرية، أكّدها بتحليل مختبر.':'Field **GH-01** is a loamy sand, slightly alkaline (**pH 8.1**), low in organic carbon (**5 g/kg**) with low field capacity (**14%**) — short, frequent irrigation suits it.\n\n- Source: OpenLandMap global soil maps (250 m) — modelled values; confirm with a lab test.',
          artifacts:[{kind:'table',title:ar?'خصائص التربة · GH-01':'Soil properties · GH-01',columns:['property','unit','0cm','30cm','60cm'],rows:rows5,total:7,chart:null}],sources:[]};
      } else if(/رطوبة|حساس|تربة|soil|moisture|sensor/i.test(t)){
        var rows4=[{field:'GH-01',readings:7,avg_moisture_pct:29.9,avg_temperature_c:27.0,avg_ec_dsm:1.66,avg_ph:6.4},{field:'GH-02',readings:7,avg_moisture_pct:24.1,avg_temperature_c:27.8,avg_ec_dsm:1.92,avg_ph:6.6},{field:'NH-01',readings:7,avg_moisture_pct:31.5,avg_temperature_c:25.9,avg_ec_dsm:1.43,avg_ph:6.6},{field:'NH-02',readings:7,avg_moisture_pct:18.7,avg_temperature_c:28.4,avg_ec_dsm:2.21,avg_ph:6.9}];
        msg={content: ar?'متوسط رطوبة التربة آخر 7 أيام: أقلها **NH-02 (18.7%)** مع أعلى EC **2.21 dS/m** — يستحق المراجعة. أعلاها **NH-01 (31.5%)**.\n\n- المصدر: قراءات حساسات التربة':'Average soil moisture, last 7 days: lowest **NH-02 (18.7%)** with the highest EC **2.21 dS/m** — worth checking. Highest **NH-01 (31.5%)**.',
          artifacts:[{kind:'table',title:ar?'حساسات التربة لكل حقل — آخر 7 أيام':'Soil sensors per field — last 7 days',columns:['field','readings','avg_moisture_pct','avg_temperature_c','avg_ec_dsm','avg_ph'],rows:rows4,total:4,chart:{type:'bar',x:'field',y:['avg_moisture_pct']}}],sources:[]};
      } else if(/كيف|how/i.test(t)){
        msg={content: ar?'لتسجيل تطبيق مبيد:\n\n1. افتح **المكافحة المتكاملة ← تطبيقات المبيدات** (`/ipm/pesticide-applications`).\n2. اضغط **تطبيق جديد**.\n3. اختر الحقل والمنتج والجرعة وتاريخ التطبيق.\n4. احفظ؛ يُحسب تاريخ انتهاء فترة ما قبل الحصاد تلقائياً.':'To record a pesticide application:\n\n1. Open **IPM → Pesticide Applications**.\n2. Click **New Application**.\n3. Choose field, product, dose and date.\n4. Save — the PHI end date is calculated.',artifacts:[],sources:[]};
      } else {
        msg={content: ar?'هذه صفحة تجريبية ببيانات نموذجية. جرّب: «كم الحصاد لكل حقل؟»، «تكلفة المبيدات لكل موقع»، «ما الحقول ضمن فترة ما قبل الحصاد؟»، أو «كيف أسجّل تطبيق مبيد؟»، أو «رطوبة التربة لكل حقل». في النظام الحقيقي يجيب المساعد على أي سؤال من قاعدة البيانات.':'This is a demo with sample data. Try: harvest per field, pesticide cost per site, fields inside PHI, or how to record a pesticide application.',artifacts:[],sources:[]};
      }
      var m={id:'m'+Date.now(),role:'assistant',created_at:new Date().toISOString(),content:msg.content,artifacts:msg.artifacts,sources:msg.sources};
      AIMSG[cidA].push({id:'u'+Date.now(),role:'user',content:t,artifacts:[],sources:[]}); AIMSG[cidA].push(m);
      return ok({conversationId:cidA,message:m});
    }
    if(path==='/countries') return ok(countries);
    if(path==='/sites') return ok(q.country_id?sites.filter(function(s){return s.countryId===q.country_id;}):sites);
    if(path==='/farm-areas') return ok(q.site_id?areas.filter(function(a){return a.siteId===q.site_id;}):areas);
    if(path==='/fields') return ok(fields);
    if(path==='/crops') return ok(CROPS.map(function(c,i){return {id:'crop'+i,name:c};}));
    if(path==='/field-types') return ok([{id:'ft1',name:'Greenhouse'},{id:'ft2',name:'Nethouse'},{id:'ft3',name:'PIVOT'}]);
    if(path==='/seasons') return ok(SEASONS);
    if(path==='/assignments/my-access') return ok({isFullAccess:true,siteIds:null});
    if(path==='/organization') return ok({id:'org1',name:'Al Maha Farm',settings:{default_site:'c7s1'}});
    if(path==='/gis/arcgis/connections'){
      if(method==='POST'){ var c={id:'layer1',name:REPORT.layer.name,source_url:(reqBody&&reqBody.url||'').replace(/\/\d+\/?$/,''),layer_index:21,attribute_mapping:reqBody&&reqBody.mapping||REPORT.mapping,sync_status:'synced',linked_features:0,synced_features:0,created:!CONN.length}; CONN=[c]; return ok(c); }
      return ok(CONN);
    }
    if(path==='/gis/arcgis/inspect'){ REPORT.url=reqBody&&reqBody.url||''; if(reqBody&&reqBody.mapping) for(var m in reqBody.mapping) if(reqBody.mapping[m]) REPORT.mapping[m]=reqBody.mapping[m]; return ok(REPORT); }
    if(/^\/gis\/layers\/[^/]+\/sync$/.test(path)) return ok({added:412,updated:0,removed:0});
    if(/^\/gis\/layers\/[^/]+\/auto-link$/.test(path)){ if(CONN[0]){CONN[0].linked_features=410;CONN[0].synced_features=412;CONN[0].last_synced_at=new Date().toISOString();} return ok({linked:410,created:39,skipped:2}); }
    if(path==='/gis/arcgis/link-issues') return ok([{issue:'duplicate_feature_keys',zone_id:'DB',farm_code:'DB-GH-07',occurrences:2},{issue:'feature_not_linked',zone_id:'KE',farm_code:'KE-PV-02',occurrences:1}]);
    if(path==='/gis/features/forms'){
      var z=(q.zone_id||'MH').toUpperCase(), code=(q.farm_code||'MH-GH-01').toUpperCase();
      return ok({features:[{feature_id:'g1',global_id:'{9F1C-DEMO}',zone_id:z,farm_code:code}],
        fields:[{field_id:'c7s1a0f1',field_name:'GH-01',zone_code:z,site_name:'Site 1',farm_area_name:'Greenhouse',gis_link_key:z+'|'+code}],
        forms:[{form_id:'7c774b7b-8363-5887-b013-736ed63651b8',form_key:'harvest.entry',title_en:'Harvest Entry',title_ar:'إدخال الحصاد',record_count:3,
                 records:ROWS.slice(0,3).map(function(r){return {record_id:'6a'+r.id+'0000-0000-4000-8000-000000000000'.slice(0,0)+r.id,record_date:r.date,values:{date:r.date,total_quantity:r.quantity,notes:r.notes}};})},
               {form_id:'3f2e6c1d-0a9b-5c4d-8e7f-1a2b3c4d5e6f',form_key:'ipm.pesticide_spray',title_en:'Pesticide — Spray',title_ar:'المبيدات — رش',record_count:2,
                 records:ROWS.slice(0,2).map(function(r){return {record_id:r.id,record_date:r.application_date,values:{product_name:r.product_name,dosage:r.dosage,cost:r.cost}};})}]});
    }
    return {success:true,data:ROWS,pagination:{total:ROWS.length,page:1,limit:50}};
  }
  var isApi=function(u){return /\/api\/v1\//.test(u);};
  var of=window.fetch;
  window.fetch=function(input,init){
    var url=typeof input==='string'?input:(input&&input.url)||'';
    if(isApi(url)){ var m=(init&&init.method)||'GET'; var b=null; try{b=init&&init.body?JSON.parse(init.body):null;}catch(e){}
      return Promise.resolve(new Response(JSON.stringify(body(url,m,b)),{status:200,headers:{'Content-Type':'application/json'}})); }
    if(/socket\.io/.test(url)) return Promise.reject(new TypeError('demo: offline'));
    return of.apply(this,arguments);
  };
  var oo=XMLHttpRequest.prototype.open, os=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(m,u){this.__u=String(u);this.__m=m;return oo.apply(this,arguments);};
  XMLHttpRequest.prototype.send=function(data){
    if(!isApi(this.__u)) return os.apply(this,arguments);
    var x=this, b=null; try{b=data?JSON.parse(data):null;}catch(e){}
    var t=JSON.stringify(body(x.__u,x.__m,b));
    ['readyState','status','responseText','response','statusText'].forEach(function(k){
      Object.defineProperty(x,k,{configurable:true,get:function(){return {readyState:4,status:200,responseText:t,response:t,statusText:'OK'}[k];}});});
    x.getAllResponseHeaders=function(){return 'content-type: application/json\r\n';};
    x.getResponseHeader=function(h){return /content-type/i.test(h)?'application/json':null;};
    setTimeout(function(){ x.onreadystatechange&&x.onreadystatechange(); x.dispatchEvent(new Event('readystatechange')); x.onload&&x.onload(); x.dispatchEvent(new Event('load')); x.onloadend&&x.onloadend(); x.dispatchEvent(new Event('loadend'));},30);
  };
})();

;(function(){
  /* Demo only: there is no server here, so satellite tiles are drawn in the browser
     from a smooth pseudo-random field coloured with the same legend as the real index. */
  var CAT=null;
  function cat(){ if(!CAT){ try{ CAT=JSON.parse(localStorage.getItem('__satcat')||'null'); }catch(e){} } return CAT; }
  function h(x,y,s){ var n=Math.sin(x*127.1+y*311.7+s*74.7)*43758.5453; return n-Math.floor(n); }
  function noise(x,y,s){ var xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi; var u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
    var a=h(xi,yi,s),b=h(xi+1,yi,s),c=h(xi,yi+1,s),d=h(xi+1,yi+1,s); return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }
  function field(x,y,s,res){ res=res||1; var B=Math.max(420,res*20);
    /* fields: blocks of ~400 m with their own crop vigour, plus soft variation inside */
    var bx=Math.floor(x/B), by=Math.floor(y/(B*0.9)), edge=(Math.abs((x/B)%1-0.5)>0.47||Math.abs((y/(B*0.9))%1-0.5)>0.47)?0.25:0;
    var blk=h(bx,by,Math.floor(s));
    var v=0.55*blk+0.25*noise(x/9000,y/9000,s)+0.2*noise(x/(B/3),y/(B/3),s+2)-edge;
    return Math.max(0,Math.min(1,v)); }
  function hex(c){ return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]; }
  function ramp(leg,v){ if(v<=leg[0].value) return hex(leg[0].color); for(var i=1;i<leg.length;i++){ if(v<=leg[i].value){ var t=(v-leg[i-1].value)/(leg[i].value-leg[i-1].value); var a=hex(leg[i-1].color),b=hex(leg[i].color); return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]; } } return hex(leg[leg.length-1].color); }
  var RANGE={NDVI:[-0.1,0.85],SAVI:[-0.1,0.7],NDWI:[-0.7,0.3],NDMI:[-0.4,0.5],NDII:[-0.4,0.5],MSI:[0.3,1.8],BSI:[-0.4,0.4]};
  function tile(url){
    var p={}; url.split('?')[1].split('&').forEach(function(kv){ var a=kv.split('='); p[decodeURIComponent(a[0]).toUpperCase()]=decodeURIComponent(a[1]||''); });
    var w=Number(p.WIDTH||256),hh=Number(p.HEIGHT||256),bb=(p.BBOX||'0,0,1,1').split(',').map(Number),idx=p.INDEX||'NDVI';
    var seed=0; (p.TIME||'').split('').forEach(function(ch){ seed=(seed*31+ch.charCodeAt(0))%997; }); seed=seed/97;
    var c=document.createElement('canvas'); c.width=w; c.height=hh; var g=c.getContext('2d'), img=g.createImageData(w,hh);
    var list=window.__SATCAT||[], def=null; for(var i=0;i<list.length;i++) if(list[i].key===idx) def=list[i];
    var step=Math.max(1,Math.round(w/256));
    for(var y=0;y<hh;y+=step){ for(var x=0;x<w;x+=step){
      var mx=bb[0]+(bb[2]-bb[0])*(x/w), my=bb[3]-(bb[3]-bb[1])*(y/hh);
      var f=field(mx,my,seed*0.15,(bb[2]-bb[0])/w), rgb;
      if(def&&def.legend){ var r=RANGE[idx]||[-1,1]; rgb=ramp(def.legend, r[0]+(r[1]-r[0])*f); }
      else if(idx==='FALSE_COLOR'){ rgb=[120+120*f,40+40*(1-f),50+40*(1-f)]; }
      else if(idx==='SWIR'){ rgb=[150+80*(1-f),120+90*f,90+60*(1-f)]; }
      else { rgb=[90+90*(1-f),110+60*f,70+50*(1-f)]; }
      for(var dy=0;dy<step;dy++) for(var dx=0;dx<step;dx++){ var o=((y+dy)*w+(x+dx))*4; img.data[o]=rgb[0]; img.data[o+1]=rgb[1]; img.data[o+2]=rgb[2]; img.data[o+3]=255; }
    } }
    g.putImageData(img,0,0); return c.toDataURL('image/png');
  }
  window.__SATCAT=[{"key":"TRUE_COLOR","label":"True color","group":"visual","formula":"B04, B03, B02","description":"Natural colours, as the eye sees them.","legend":null,"visual":true},{"key":"FALSE_COLOR","label":"Color infrared (vegetation)","group":"visual","formula":"B08, B04, B03","description":"Healthy vegetation in bright red.","legend":null,"visual":true},{"key":"SWIR","label":"SWIR (soil & moisture)","group":"visual","formula":"B12, B8A, B04","description":"Wet soil dark, dry soil and bare ground bright.","legend":null,"visual":true},{"key":"NDVI","label":"NDVI","group":"vegetation","formula":"(B08 − B04) / (B08 + B04)","description":"Vegetation health and density.","legend":[{"value":-0.2,"color":"#a50026"},{"value":0,"color":"#d73027"},{"value":0.1,"color":"#f46d43"},{"value":0.2,"color":"#fdae61"},{"value":0.3,"color":"#fee08b"},{"value":0.4,"color":"#d9ef8b"},{"value":0.5,"color":"#a6d96a"},{"value":0.6,"color":"#66bd63"},{"value":0.7,"color":"#1a9850"},{"value":0.9,"color":"#006837"}],"visual":false},{"key":"SAVI","label":"SAVI","group":"vegetation","formula":"1.5 × (B08 − B04) / (B08 + B04 + 0.5)","description":"NDVI corrected for bright soil; better for young crops.","legend":[{"value":-0.2,"color":"#a50026"},{"value":0,"color":"#d73027"},{"value":0.1,"color":"#f46d43"},{"value":0.2,"color":"#fdae61"},{"value":0.3,"color":"#fee08b"},{"value":0.4,"color":"#d9ef8b"},{"value":0.5,"color":"#a6d96a"},{"value":0.6,"color":"#66bd63"},{"value":0.7,"color":"#1a9850"},{"value":0.9,"color":"#006837"}],"visual":false},{"key":"NDWI","label":"NDWI","group":"water","formula":"(B03 − B08) / (B03 + B08)","description":"Open water and water bodies.","legend":[{"value":-0.8,"color":"#8c510a"},{"value":-0.4,"color":"#d8b365"},{"value":-0.1,"color":"#f6e8c3"},{"value":0,"color":"#c7eae5"},{"value":0.2,"color":"#5ab4ac"},{"value":0.5,"color":"#01665e"},{"value":0.8,"color":"#003c30"}],"visual":false},{"key":"NDMI","label":"NDMI","group":"water","formula":"(B08 − B11) / (B08 + B11)","description":"Moisture in the crop canopy.","legend":[{"value":-0.6,"color":"#8c2d04"},{"value":-0.3,"color":"#cc4c02"},{"value":-0.1,"color":"#fe9929"},{"value":0,"color":"#fee391"},{"value":0.1,"color":"#c7e9b4"},{"value":0.2,"color":"#7fcdbb"},{"value":0.4,"color":"#2c7fb8"},{"value":0.6,"color":"#253494"}],"visual":false},{"key":"NDII","label":"NDII","group":"water","formula":"(B08 − B11) / (B08 + B11)","description":"Infrared water-content index (same Sentinel-2 bands as NDMI).","legend":[{"value":-0.6,"color":"#8c2d04"},{"value":-0.3,"color":"#cc4c02"},{"value":-0.1,"color":"#fe9929"},{"value":0,"color":"#fee391"},{"value":0.1,"color":"#c7e9b4"},{"value":0.2,"color":"#7fcdbb"},{"value":0.4,"color":"#2c7fb8"},{"value":0.6,"color":"#253494"}],"visual":false},{"key":"MSI","label":"Moisture stress (MSI)","group":"water","formula":"B11 / B08","description":"Higher values mean drier, stressed plants.","legend":[{"value":0.2,"color":"#253494"},{"value":0.6,"color":"#41b6c4"},{"value":1,"color":"#ffffcc"},{"value":1.4,"color":"#fd8d3c"},{"value":2,"color":"#bd0026"}],"visual":false},{"key":"BSI","label":"Bare soil (BSI)","group":"soil","formula":"((B11 + B04) − (B08 + B02)) / ((B11 + B04) + (B08 + B02))","description":"Bare and exposed soil.","legend":[{"value":-0.6,"color":"#1a9850"},{"value":-0.2,"color":"#91cf60"},{"value":0,"color":"#fee08b"},{"value":0.15,"color":"#fc8d59"},{"value":0.3,"color":"#d73027"},{"value":0.6,"color":"#7f0000"}],"visual":false}];
  var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
  Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,enumerable:true,
    get:function(){ return d.get.call(this); },
    set:function(v){ if(typeof v==='string'&&v.indexOf('/satellite/wms')>=0){ try{ v=tile(v); }catch(e){} } d.set.call(this,v); }});
  var of=window.fetch;
  window.fetch=function(u,o){ if(typeof u==='string'&&u.indexOf('/satellite/wms')>=0){ var data=tile(u); return of(data); } return of.apply(this,arguments); };
})();
