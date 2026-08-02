/* =============================================================================
   Stadium to Screen — market data + deterministic audience model
   -----------------------------------------------------------------------------
   SINGLE SOURCE OF TRUTH. Loaded by the browser (window.S1_DATA) AND by the
   Node server (require). The AUDIENCE NUMBERS are computed here from real
   baseline data + transparent multipliers — NOT from any AI model.

   >>> VERIFY BEFORE LAUNCH <<<
   - DMA_HOUSEHOLDS are approximate Nielsen TV-household counts. Replace with
     current Nielsen DMA figures.
   - STATE_POP are approximate Census populations. Replace with current Census.
   - The multipliers/penetration rates below are industry-average planning
     assumptions. Tune them to your own data. Every one is editable in one place.
============================================================================= */

(function (root) {

  // ---- Editable planning assumptions (document these to clients) -------------
  const AVG_HH_SIZE = 2.5;               // people per household (US avg)
  const DEVICE_PER_HH = {                // connected devices per household (avg)
    phones: 2.6,
    computers: 1.6,
    tablets: 0.9,
    connectedTV: 2.3
  };
  const MATCH_RATE = 0.55;               // share of devices realistically matchable programmatically
  const FAN_PENETRATION = {              // rough share of the geography that is a reachable fan
    local: 0.20,                         // dense, home-market concentration
    regional: 0.08,                      // statewide
    national: 0.03                       // nationwide
  };
  const NATIONAL = { households: 132000000, population: 335000000 };

  // ---- Baseline geography data (APPROX — verify) -----------------------------
  // DMA -> approximate TV households
  const DMA_HOUSEHOLDS = {
    "New York, NY": 7450000, "Los Angeles, CA": 5700000, "Chicago, IL": 3500000,
    "Philadelphia, PA": 3050000, "Dallas-Fort Worth, TX": 2950000, "Houston, TX": 2700000,
    "San Francisco-Oakland-San Jose, CA": 2700000, "Washington, DC": 2600000,
    "Atlanta, GA": 2650000, "Boston, MA": 2500000, "Phoenix, AZ": 2150000,
    "Tampa-St. Petersburg, FL": 2050000, "Seattle-Tacoma, WA": 2050000,
    "Detroit, MI": 1900000, "Minneapolis-St. Paul, MN": 1850000, "Denver, CO": 1750000,
    "Miami-Fort Lauderdale, FL": 1750000, "Cleveland-Akron, OH": 1480000,
    "Charlotte, NC": 1320000, "Raleigh-Durham, NC": 1300000, "Nashville, TN": 1270000,
    "Baltimore, MD": 1180000, "Salt Lake City, UT": 1180000, "Indianapolis, IN": 1160000,
    "Pittsburgh, PA": 1130000, "Columbus, OH": 1000000, "Kansas City, MO": 970000,
    "Austin, TX": 950000, "Cincinnati, OH": 940000, "Las Vegas, NV": 900000,
    "Greenville-Spartanburg-Asheville-Anderson": 900000, "Jacksonville, FL": 800000,
    "Oklahoma City, OK": 750000, "Birmingham, AL": 760000, "Louisville, KY": 700000,
    "New Orleans, LA": 690000, "Memphis, TN": 690000, "Buffalo, NY": 630000,
    "Knoxville, TN": 570000, "Tulsa, OK": 540000, "Lexington, KY": 500000,
    "Madison, WI": 470000, "Roanoke-Lynchburg, VA": 450000, "Green Bay, WI": 440000,
    "Columbia, SC": 420000, "Lincoln & Hastings-Kearney, NE": 400000,
    "Waco-Temple-Bryan, TX": 380000, "Cedar Rapids-Waterloo-Iowa City, IA": 350000,
    "South Bend-Elkhart, IN": 320000, "Fort Smith-Fayetteville-Springdale-Rogers, AR": 300000,
    "Tallahassee-Thomasville, FL": 280000, "Johnstown-Altoona-State College, PA": 280000,
    "Eugene, OR": 270000, "Lansing, MI": 250000, "Columbus-Tupelo-West Point, MS": 200000,
    "Columbia-Jefferson City, MO": 200000, "Topeka, KS": 170000, "Lubbock, TX": 160000,
    "Gainesville, FL": 130000, "Clarksburg-Weston, WV": 120000,
    "Columbus, GA (Opelika-Auburn)": 210000
  };

  // State (2-letter) -> {name, population}  (APPROX — verify vs Census)
  const STATES = {
    AL:["Alabama",5100000], AK:["Alaska",733000], AZ:["Arizona",7400000], AR:["Arkansas",3070000],
    CA:["California",38900000], CO:["Colorado",5900000], CT:["Connecticut",3600000], DE:["Delaware",1030000],
    DC:["District of Columbia",680000], FL:["Florida",22600000], GA:["Georgia",11000000], HI:["Hawaii",1440000],
    ID:["Idaho",1960000], IL:["Illinois",12500000], IN:["Indiana",6860000], IA:["Iowa",3200000],
    KS:["Kansas",2940000], KY:["Kentucky",4530000], LA:["Louisiana",4570000], ME:["Maine",1390000],
    MD:["Maryland",6180000], MA:["Massachusetts",7000000], MI:["Michigan",10040000], MN:["Minnesota",5740000],
    MS:["Mississippi",2940000], MO:["Missouri",6190000], MT:["Montana",1130000], NE:["Nebraska",1980000],
    NV:["Nevada",3190000], NH:["New Hampshire",1400000], NJ:["New Jersey",9290000], NM:["New Mexico",2110000],
    NY:["New York",19570000], NC:["North Carolina",10700000], ND:["North Dakota",780000], OH:["Ohio",11790000],
    OK:["Oklahoma",4050000], OR:["Oregon",4240000], PA:["Pennsylvania",12960000], RI:["Rhode Island",1100000],
    SC:["South Carolina",5370000], SD:["South Dakota",920000], TN:["Tennessee",7130000], TX:["Texas",30500000],
    UT:["Utah",3420000], VT:["Vermont",650000], VA:["Virginia",8720000], WA:["Washington",7810000],
    WV:["West Virginia",1770000], WI:["Wisconsin",5910000], WY:["Wyoming",580000]
  };

  // ---- Team rosters ----------------------------------------------------------
  // {name, city, venue, state (2-letter), dma (key into DMA_HOUSEHOLDS)}
  const COLLEGE = [
    ["Ohio State Buckeyes","Columbus, OH","Ohio Stadium","OH","Columbus, OH"],
    ["Michigan Wolverines","Ann Arbor, MI","Michigan Stadium","MI","Detroit, MI"],
    ["Alabama Crimson Tide","Tuscaloosa, AL","Bryant-Denny Stadium","AL","Birmingham, AL"],
    ["Georgia Bulldogs","Athens, GA","Sanford Stadium","GA","Atlanta, GA"],
    ["Texas Longhorns","Austin, TX","DKR–Texas Memorial Stadium","TX","Austin, TX"],
    ["Penn State Nittany Lions","State College, PA","Beaver Stadium","PA","Johnstown-Altoona-State College, PA"],
    ["LSU Tigers","Baton Rouge, LA","Tiger Stadium","LA","New Orleans, LA"],
    ["Tennessee Volunteers","Knoxville, TN","Neyland Stadium","TN","Knoxville, TN"],
    ["Notre Dame Fighting Irish","South Bend, IN","Notre Dame Stadium","IN","South Bend-Elkhart, IN"],
    ["Oklahoma Sooners","Norman, OK","Gaylord Family Oklahoma Memorial Stadium","OK","Oklahoma City, OK"],
    ["Texas A&M Aggies","College Station, TX","Kyle Field","TX","Waco-Temple-Bryan, TX"],
    ["Nebraska Cornhuskers","Lincoln, NE","Memorial Stadium","NE","Lincoln & Hastings-Kearney, NE"],
    ["Florida Gators","Gainesville, FL","Ben Hill Griffin Stadium","FL","Gainesville, FL"],
    ["Auburn Tigers","Auburn, AL","Jordan-Hare Stadium","AL","Columbus, GA (Opelika-Auburn)"],
    ["USC Trojans","Los Angeles, CA","L.A. Memorial Coliseum","CA","Los Angeles, CA"],
    ["Michigan State Spartans","East Lansing, MI","Spartan Stadium","MI","Lansing, MI"],
    ["Wisconsin Badgers","Madison, WI","Camp Randall Stadium","WI","Madison, WI"],
    ["Clemson Tigers","Clemson, SC","Memorial Stadium (Death Valley)","SC","Greenville-Spartanburg-Asheville-Anderson"],
    ["Oregon Ducks","Eugene, OR","Autzen Stadium","OR","Eugene, OR"],
    ["Florida State Seminoles","Tallahassee, FL","Doak Campbell Stadium","FL","Tallahassee-Thomasville, FL"],
    ["South Carolina Gamecocks","Columbia, SC","Williams-Brice Stadium","SC","Columbia, SC"],
    ["Iowa Hawkeyes","Iowa City, IA","Kinnick Stadium","IA","Cedar Rapids-Waterloo-Iowa City, IA"],
    ["Washington Huskies","Seattle, WA","Husky Stadium","WA","Seattle-Tacoma, WA"],
    ["Ole Miss Rebels","Oxford, MS","Vaught-Hemingway Stadium","MS","Memphis, TN"],
    ["Arkansas Razorbacks","Fayetteville, AR","Razorback Stadium","AR","Fort Smith-Fayetteville-Springdale-Rogers, AR"],
    ["Miami Hurricanes","Miami Gardens, FL","Hard Rock Stadium","FL","Miami-Fort Lauderdale, FL"],
    ["UCLA Bruins","Pasadena, CA","Rose Bowl","CA","Los Angeles, CA"],
    ["Kentucky Wildcats","Lexington, KY","Kroger Field","KY","Lexington, KY"],
    ["Missouri Tigers","Columbia, MO","Faurot Field","MO","Columbia-Jefferson City, MO"],
    ["Virginia Tech Hokies","Blacksburg, VA","Lane Stadium","VA","Roanoke-Lynchburg, VA"],
    ["Oklahoma State Cowboys","Stillwater, OK","Boone Pickens Stadium","OK","Tulsa, OK"],
    ["Texas Tech Red Raiders","Lubbock, TX","Jones AT&T Stadium","TX","Lubbock, TX"],
    ["Utah Utes","Salt Lake City, UT","Rice-Eccles Stadium","UT","Salt Lake City, UT"],
    ["Colorado Buffaloes","Boulder, CO","Folsom Field","CO","Denver, CO"],
    ["Mississippi State Bulldogs","Starkville, MS","Davis Wade Stadium","MS","Columbus-Tupelo-West Point, MS"],
    ["Minnesota Golden Gophers","Minneapolis, MN","Huntington Bank Stadium","MN","Minneapolis-St. Paul, MN"],
    ["North Carolina Tar Heels","Chapel Hill, NC","Kenan Stadium","NC","Raleigh-Durham, NC"],
    ["Louisville Cardinals","Louisville, KY","L&N Federal Credit Union Stadium","KY","Louisville, KY"],
    ["West Virginia Mountaineers","Morgantown, WV","Milan Puskar Stadium","WV","Clarksburg-Weston, WV"],
    ["Kansas State Wildcats","Manhattan, KS","Bill Snyder Family Stadium","KS","Topeka, KS"]
  ];

  const PRO = [
    ["Arizona Cardinals","Glendale, AZ","State Farm Stadium","AZ","Phoenix, AZ"],
    ["Atlanta Falcons","Atlanta, GA","Mercedes-Benz Stadium","GA","Atlanta, GA"],
    ["Baltimore Ravens","Baltimore, MD","M&T Bank Stadium","MD","Baltimore, MD"],
    ["Buffalo Bills","Orchard Park, NY","Highmark Stadium","NY","Buffalo, NY"],
    ["Carolina Panthers","Charlotte, NC","Bank of America Stadium","NC","Charlotte, NC"],
    ["Chicago Bears","Chicago, IL","Soldier Field","IL","Chicago, IL"],
    ["Cincinnati Bengals","Cincinnati, OH","Paycor Stadium","OH","Cincinnati, OH"],
    ["Cleveland Browns","Cleveland, OH","Huntington Bank Field","OH","Cleveland-Akron, OH"],
    ["Dallas Cowboys","Arlington, TX","AT&T Stadium","TX","Dallas-Fort Worth, TX"],
    ["Denver Broncos","Denver, CO","Empower Field at Mile High","CO","Denver, CO"],
    ["Detroit Lions","Detroit, MI","Ford Field","MI","Detroit, MI"],
    ["Green Bay Packers","Green Bay, WI","Lambeau Field","WI","Green Bay, WI"],
    ["Houston Texans","Houston, TX","NRG Stadium","TX","Houston, TX"],
    ["Indianapolis Colts","Indianapolis, IN","Lucas Oil Stadium","IN","Indianapolis, IN"],
    ["Jacksonville Jaguars","Jacksonville, FL","EverBank Stadium","FL","Jacksonville, FL"],
    ["Kansas City Chiefs","Kansas City, MO","Arrowhead Stadium","MO","Kansas City, MO"],
    ["Las Vegas Raiders","Las Vegas, NV","Allegiant Stadium","NV","Las Vegas, NV"],
    ["Los Angeles Chargers","Inglewood, CA","SoFi Stadium","CA","Los Angeles, CA"],
    ["Los Angeles Rams","Inglewood, CA","SoFi Stadium","CA","Los Angeles, CA"],
    ["Miami Dolphins","Miami Gardens, FL","Hard Rock Stadium","FL","Miami-Fort Lauderdale, FL"],
    ["Minnesota Vikings","Minneapolis, MN","U.S. Bank Stadium","MN","Minneapolis-St. Paul, MN"],
    ["New England Patriots","Foxborough, MA","Gillette Stadium","MA","Boston, MA"],
    ["New Orleans Saints","New Orleans, LA","Caesars Superdome","LA","New Orleans, LA"],
    ["New York Giants","East Rutherford, NJ","MetLife Stadium","NJ","New York, NY"],
    ["New York Jets","East Rutherford, NJ","MetLife Stadium","NJ","New York, NY"],
    ["Philadelphia Eagles","Philadelphia, PA","Lincoln Financial Field","PA","Philadelphia, PA"],
    ["Pittsburgh Steelers","Pittsburgh, PA","Acrisure Stadium","PA","Pittsburgh, PA"],
    ["San Francisco 49ers","Santa Clara, CA","Levi's Stadium","CA","San Francisco-Oakland-San Jose, CA"],
    ["Seattle Seahawks","Seattle, WA","Lumen Field","WA","Seattle-Tacoma, WA"],
    ["Tampa Bay Buccaneers","Tampa, FL","Raymond James Stadium","FL","Tampa-St. Petersburg, FL"],
    ["Tennessee Titans","Nashville, TN","Nissan Stadium","TN","Nashville, TN"],
    ["Washington Commanders","Landover, MD","Northwest Stadium","MD","Washington, DC"]
  ];

  // ---- Normalize rosters into objects ---------------------------------------
  function pack(arr, league) {
    return arr.map(([name, city, venue, state, dma]) => ({
      name, city, venue, state, dma, league,
      stateName: (STATES[state] || [state])[0],
      dmaHouseholds: DMA_HOUSEHOLDS[dma] || null,
      stateHouseholds: STATES[state] ? Math.round(STATES[state][1] / AVG_HH_SIZE) : null
    }));
  }
  const TEAMS = { college: pack(COLLEGE, "college"), pro: pack(PRO, "pro") };

  // ---- Lookups & model -------------------------------------------------------
  function findTeam(league, name) {
    if (!name) return null;
    const q = String(name).trim().toLowerCase();
    const list = TEAMS[league] || [];
    return list.find(t => t.name.toLowerCase() === q)
        || list.find(t => t.name.toLowerCase().includes(q) && q.length > 2)
        || null;
  }

  function marketForScope(team, scope) {
    if (scope === "national")
      return { label: "United States", households: NATIONAL.households,
               population: NATIONAL.population, geo: "nationwide" };
    if (scope === "regional")
      return { label: team.stateName, households: team.stateHouseholds,
               population: STATES[team.state] ? STATES[team.state][1] : null,
               geo: `the state of ${team.stateName}` };
    // local (default)
    return { label: `${team.dma} DMA`, households: team.dmaHouseholds,
             population: team.dmaHouseholds ? Math.round(team.dmaHouseholds * AVG_HH_SIZE) : null,
             geo: `the ${team.dma} media market (DMA)` };
  }

  function computeMetrics(team, scope) {
    const m = marketForScope(team, scope);
    const hh = m.households || 0;
    const pen = FAN_PENETRATION[scope] || FAN_PENETRATION.local;
    const devices = {
      phones: Math.round(hh * DEVICE_PER_HH.phones),
      computers: Math.round(hh * DEVICE_PER_HH.computers),
      tablets: Math.round(hh * DEVICE_PER_HH.tablets),
      connectedTV: Math.round(hh * DEVICE_PER_HH.connectedTV)
    };
    devices.total = devices.phones + devices.computers + devices.tablets + devices.connectedTV;
    return {
      scope, scopeLabel: m.label, geo: m.geo,
      fanBase: Math.round((m.population || hh * AVG_HH_SIZE) * pen),
      households: hh,
      devices,
      matchable: Math.round(devices.total * MATCH_RATE)
    };
  }

  function recommendPackage(focus) {
    if (focus === "ctv")
      return { name: "The Championship (CTV)", price: "$6,000/mo",
        note: "Premium CTV inventory with $2,000 dedicated to Venue Replay stadium targeting." };
    if (focus === "both")
      return { name: "Full-Field Coverage (Audio + CTV)", price: "from $6,000/mo",
        note: "Multi-screen saturation — CTV awareness feeding streaming audio and mobile Venue Replay." };
    return { name: "The Champion (Audio)", price: "$4,500/mo",
      note: "Full 3-block audio flow plus the Stadium Display Add-On for local retargeting." };
  }

  // Static fallback used when the AI service is unavailable ---------------------
  function fallbackRecommendations(focus) {
    const audioSvc = ["Spotify","Pandora","iHeartRadio","Audacy","Amazon Music","SiriusXM"];
    const ctvSvc = ["Hulu + Live TV","YouTube TV","Sling TV","Fubo","ESPN+","Paramount+","Peacock","Roku Channel"];
    const svc = focus === "ctv" ? ctvSvc : focus === "both" ? [...ctvSvc.slice(0,5), ...audioSvc.slice(0,4)] : audioSvc;
    const wantAudio = focus === "audio" || focus === "both";
    return {
      streamingServices: svc.map(name => ({ name, why: "Common football-fan inventory" })),
      podcasts: wantAudio ? [
        { name: "The Paul Finebaum Show", network: "ESPN / SEC Network" },
        { name: "The Solid Verbal", network: "College football" },
        { name: "The Pat McAfee Show", network: "ESPN" },
        { name: "The Bill Simmons Podcast", network: "The Ringer" }
      ] : [],
      sportsNetworks: ["ESPN","Fox Sports","CBS Sports","NBC Sports","The Athletic","Bleacher Report"]
        .map(name => ({ name, why: "National sports audience" })),
      relatedAudiences: ["Sports betting & DFS","Trucks & domestic auto","QSR & pizza delivery",
        "Beer, spirits & tailgate","Sportswear & fan gear","Home improvement"]
        .map(name => ({ name, why: "Indexes high with football fans" }))
    };
  }

  const DATA = {
    TEAMS, STATES, DMA_HOUSEHOLDS, NATIONAL,
    AVG_HH_SIZE, DEVICE_PER_HH, MATCH_RATE, FAN_PENETRATION,
    findTeam, marketForScope, computeMetrics, recommendPackage, fallbackRecommendations
  };

  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  else root.S1_DATA = DATA;

})(typeof self !== "undefined" ? self : this);
