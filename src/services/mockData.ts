import { MapTilePackage, SyncQueueItem, Waypoint, IncidentReport, RouteOption } from '../types';

export const INITIAL_MAP_PACKAGES: MapTilePackage[] = [];

export const INITIAL_SYNC_ITEMS: SyncQueueItem[] = [];

export const DEFAULT_TACTICAL_WAYPOINTS: Waypoint[] = [];

export const INITIAL_INCIDENT_REPORTS: IncidentReport[] = [];

export const TACTICAL_ROUTES: RouteOption[] = [
  {
    id: 'route-del-chd',
    name: 'Northern Grand Corridor (NH-44 / GT Road)',
    destination: 'Chandigarh Transport Terminal',
    callsign: 'ROUTE-NORTH-01',
    roadSegment: 'NH-44 National Highway',
    distanceKm: 242.0,
    estMinutes: 215,
    elevationGainM: 140,
    hazardCount: 0,
    isOfflineCached: true,
    steps: [
      {
        instruction: 'Depart Central Delhi heading north on NH-44',
        distanceMeters: 4500,
        durationSeconds: 360,
        maneuver: 'depart',
        roadName: 'Grand Trunk Road / NH-44',
        location: [28.613939, 77.209021]
      },
      {
        instruction: 'Continue straight through Panipat Elevated Expressway',
        distanceMeters: 85000,
        durationSeconds: 4200,
        maneuver: 'straight',
        roadName: 'NH-44 Panipat Expressway',
        location: [29.390900, 76.963500]
      },
      {
        instruction: 'Pass Karnal Bypass and proceed toward Ambala Junction',
        distanceMeters: 78000,
        durationSeconds: 3900,
        maneuver: 'straight',
        roadName: 'NH-44 Karnal-Ambala Highway',
        location: [29.685700, 76.990500]
      },
      {
        instruction: 'At Ambala Interchange, take the right ramp onto NH-152 toward Chandigarh',
        distanceMeters: 42000,
        durationSeconds: 2400,
        maneuver: 'ramp-right',
        roadName: 'NH-152 Chandigarh Expressway',
        location: [30.378200, 76.776700]
      },
      {
        instruction: 'Arrive at Chandigarh Transport Terminal & City Center',
        distanceMeters: 0,
        durationSeconds: 0,
        maneuver: 'arrive',
        roadName: 'Chandigarh City Terminal',
        location: [30.733300, 76.779400]
      }
    ],
    waypoints: [
      [28.613939, 77.209021],
      [28.704100, 77.102500],
      [28.895500, 77.098400],
      [29.149200, 77.012500],
      [29.390900, 76.963500],
      [29.685700, 76.990500],
      [29.969500, 76.878300],
      [30.221500, 76.812300],
      [30.378200, 76.776700],
      [30.550100, 76.820200],
      [30.733300, 76.779400]
    ]
  },
  {
    id: 'route-mum-pun',
    name: 'Western Express Corridor (Mumbai-Pune Expressway / NH-48)',
    destination: 'Pune Central Junction',
    callsign: 'ROUTE-WEST-02',
    roadSegment: 'Yashwantrao Chavan Expressway',
    distanceKm: 148.5,
    estMinutes: 140,
    elevationGainM: 560,
    hazardCount: 0,
    isOfflineCached: true,
    steps: [
      {
        instruction: 'Depart South Mumbai via Eastern Freeway toward Kalamboli',
        distanceMeters: 32000,
        durationSeconds: 2100,
        maneuver: 'depart',
        roadName: 'Eastern Freeway / Sion-Panvel Highway',
        location: [18.922000, 72.834700]
      },
      {
        instruction: 'Merge onto Mumbai-Pune 6-Lane Expressway (Access-Controlled Corridor)',
        distanceMeters: 62000,
        durationSeconds: 3200,
        maneuver: 'straight',
        roadName: 'Mumbai-Pune Expressway',
        location: [18.989400, 73.127700]
      },
      {
        instruction: 'Caution: Ascend Bhor Ghat / Khandala section through mountain tunnels',
        distanceMeters: 28000,
        durationSeconds: 1900,
        maneuver: 'straight',
        roadName: 'Bhor Ghat Pass',
        location: [18.755700, 73.409100]
      },
      {
        instruction: 'Take exit toward Pune Western Ring Corridor',
        distanceMeters: 26500,
        durationSeconds: 1500,
        maneuver: 'ramp-right',
        roadName: 'Pune Bypass Highway',
        location: [18.627900, 73.746700]
      },
      {
        instruction: 'Arrive at Pune Central Junction & City Hub',
        distanceMeters: 0,
        durationSeconds: 0,
        maneuver: 'arrive',
        roadName: 'Pune City Terminal',
        location: [18.520400, 73.856700]
      }
    ],
    waypoints: [
      [18.922000, 72.834700],
      [19.017800, 72.847800],
      [19.060700, 72.998600],
      [18.989400, 73.127700],
      [18.895000, 73.284000],
      [18.755700, 73.409100],
      [18.718000, 73.541000],
      [18.627900, 73.746700],
      [18.520400, 73.856700]
    ]
  },
  {
    id: 'route-blr-mys',
    name: 'Southern Deccan Corridor (Bengaluru-Mysuru Expressway / NH-275)',
    destination: 'Mysuru Highway Terminal',
    callsign: 'ROUTE-SOUTH-03',
    roadSegment: 'NH-275 Access-Controlled Expressway',
    distanceKm: 143.0,
    estMinutes: 110,
    elevationGainM: -180,
    hazardCount: 0,
    isOfflineCached: true,
    steps: [
      {
        instruction: 'Depart Bengaluru via NICE Junction onto Expressway',
        distanceMeters: 18000,
        durationSeconds: 1200,
        maneuver: 'depart',
        roadName: 'Mysuru Road / NICE Junction',
        location: [12.971600, 77.594600]
      },
      {
        instruction: 'Enter Bengaluru-Mysuru Expressway 10-Lane Corridor',
        distanceMeters: 65000,
        durationSeconds: 2700,
        maneuver: 'straight',
        roadName: 'NH-275 Expressway',
        location: [12.720000, 77.280000]
      },
      {
        instruction: 'Pass Mandya Bypass toward Srirangapatna Heritage Crossing',
        distanceMeters: 45000,
        durationSeconds: 2100,
        maneuver: 'straight',
        roadName: 'NH-275 Mandya Sector',
        location: [12.520000, 76.900000]
      },
      {
        instruction: 'Arrive at Mysuru Highway Terminal',
        distanceMeters: 0,
        durationSeconds: 0,
        maneuver: 'arrive',
        roadName: 'Mysuru Ring Road',
        location: [12.295800, 76.639400]
      }
    ],
    waypoints: [
      [12.971600, 77.594600],
      [12.895000, 77.490000],
      [12.720000, 77.280000],
      [12.600000, 77.100000],
      [12.520000, 76.900000],
      [12.420000, 76.700000],
      [12.295800, 76.639400]
    ]
  },
  {
    id: 'route-kol-bbs',
    name: 'Eastern Coastal Corridor (NH-16 Kolkata-Bhubaneswar)',
    destination: 'Bhubaneswar Central Terminal',
    callsign: 'ROUTE-EAST-04',
    roadSegment: 'NH-16 Coastal Highway',
    distanceKm: 440.0,
    estMinutes: 380,
    elevationGainM: 45,
    hazardCount: 0,
    isOfflineCached: true,
    steps: [
      {
        instruction: 'Depart Kolkata across Vidyasagar Setu',
        distanceMeters: 14000,
        durationSeconds: 1100,
        maneuver: 'depart',
        roadName: 'Kona Expressway / NH-16',
        location: [22.572600, 88.363900]
      },
      {
        instruction: 'Proceed along 6-Lane NH-16 through Kharagpur Industrial Junction',
        distanceMeters: 120000,
        durationSeconds: 6000,
        maneuver: 'straight',
        roadName: 'NH-16 Kharagpur Corridor',
        location: [22.340000, 87.320000]
      },
      {
        instruction: 'Cross Bengal-Odisha border toward Balasore Coastal Segment',
        distanceMeters: 110000,
        durationSeconds: 5800,
        maneuver: 'straight',
        roadName: 'NH-16 Balasore Highway',
        location: [21.493400, 86.913500]
      },
      {
        instruction: 'Continue south past Cuttack Mahanadi Bridge into Bhubaneswar',
        distanceMeters: 196000,
        durationSeconds: 9800,
        maneuver: 'straight',
        roadName: 'NH-16 Cuttack-Bhubaneswar Corridor',
        location: [20.462500, 85.882800]
      },
      {
        instruction: 'Arrive at Bhubaneswar Central Terminal',
        distanceMeters: 0,
        durationSeconds: 0,
        maneuver: 'arrive',
        roadName: 'Bhubaneswar Central Terminal',
        location: [20.296100, 85.824500]
      }
    ],
    waypoints: [
      [22.572600, 88.363900],
      [22.540000, 88.290000],
      [22.410000, 87.980000],
      [22.340000, 87.320000],
      [21.930000, 87.050000],
      [21.493400, 86.913500],
      [20.900000, 86.300000],
      [20.462500, 85.882800],
      [20.296100, 85.824500]
    ]
  },
  {
    id: 'route-nag-jbp',
    name: 'Zero-Mile Central India Corridor (NH-44 Nagpur-Jabalpur)',
    destination: 'Jabalpur City Terminal',
    callsign: 'ROUTE-CENTRAL-05',
    roadSegment: 'NH-44 Central Heartland Expressway',
    distanceKm: 275.0,
    estMinutes: 250,
    elevationGainM: 190,
    hazardCount: 0,
    isOfflineCached: true,
    steps: [
      {
        instruction: 'Depart Nagpur heading north on NH-44',
        distanceMeters: 12000,
        durationSeconds: 900,
        maneuver: 'depart',
        roadName: 'NH-44 Northbound Corridor',
        location: [21.145800, 79.088200]
      },
      {
        instruction: 'Traverse Pench Forest Elevated Corridor & Wildlife Passages',
        distanceMeters: 95000,
        durationSeconds: 4800,
        maneuver: 'straight',
        roadName: 'NH-44 Elevated Eco-Corridor',
        location: [21.750000, 79.350000]
      },
      {
        instruction: 'Proceed through Seoni Bypass toward Jabalpur Ring Road',
        distanceMeters: 168000,
        durationSeconds: 8800,
        maneuver: 'straight',
        roadName: 'NH-44 Seoni-Jabalpur Highway',
        location: [22.086900, 79.543500]
      },
      {
        instruction: 'Arrive at Jabalpur City Terminal',
        distanceMeters: 0,
        durationSeconds: 0,
        maneuver: 'arrive',
        roadName: 'Jabalpur City Terminal',
        location: [23.181500, 79.986400]
      }
    ],
    waypoints: [
      [21.145800, 79.088200],
      [21.450000, 79.200000],
      [21.750000, 79.350000],
      [22.086900, 79.543500],
      [22.580000, 79.720000],
      [23.181500, 79.986400]
    ]
  },
  {
    id: 'route-leh-khardung',
    name: 'Northern High-Altitude Pass (Leh to Khardung La)',
    destination: 'Khardung La High Pass Summit',
    callsign: 'ROUTE-LADAKH-06',
    roadSegment: 'Leh-Nubra Pass Highway',
    distanceKm: 39.8,
    estMinutes: 85,
    elevationGainM: 1850,
    hazardCount: 0,
    isOfflineCached: true,
    steps: [
      {
        instruction: 'Depart Leh ascending North Ridge Switchbacks',
        distanceMeters: 6200,
        durationSeconds: 650,
        maneuver: 'depart',
        roadName: 'Leh-Khardung La Road',
        location: [34.152600, 77.577100]
      },
      {
        instruction: 'Pass South Pullu Checkpoint (Permit Verification & Oxygen Point)',
        distanceMeters: 18500,
        durationSeconds: 2100,
        maneuver: 'straight',
        roadName: 'South Pullu High Pass',
        location: [34.220000, 77.590000]
      },
      {
        instruction: 'Caution: Single lane hairpin turns over permafrost and snow crest',
        distanceMeters: 15100,
        durationSeconds: 2350,
        maneuver: 'straight',
        roadName: 'Khardung Ridge Pass',
        location: [34.260000, 77.600000]
      },
      {
        instruction: 'Arrive at Khardung La High Pass Summit (Elevation 5,359m / 17,582 ft)',
        distanceMeters: 0,
        durationSeconds: 0,
        maneuver: 'arrive',
        roadName: 'Khardung La Summit',
        location: [34.278700, 77.604700]
      }
    ],
    waypoints: [
      [34.152600, 77.577100],
      [34.180000, 77.582000],
      [34.220000, 77.590000],
      [34.250000, 77.598000],
      [34.278700, 77.604700]
    ]
  },
  {
    id: 'route-del-agr',
    name: 'Yamuna Expressway Corridor (Delhi to Agra)',
    destination: 'Agra Fort Terminal, Uttar Pradesh',
    callsign: 'EXPR-YAMUNA-01',
    roadSegment: 'Yamuna Expressway (6-Lane Controlled)',
    distanceKm: 210.0,
    estMinutes: 180,
    elevationGainM: 65,
    hazardCount: 0,
    isOfflineCached: true,
    steps: [
      {
        instruction: 'Depart Greater Noida Zero Point onto Yamuna Expressway',
        distanceMeters: 12000,
        durationSeconds: 600,
        maneuver: 'depart',
        roadName: 'Yamuna Expressway / Taj Highway',
        location: [28.4744, 77.5040]
      },
      {
        instruction: 'Maintain 100 km/h speed limit along concrete 6-lane express corridor',
        distanceMeters: 140000,
        durationSeconds: 5040,
        maneuver: 'straight',
        roadName: 'Yamuna Expressway Mainline',
        location: [27.8900, 77.7200]
      },
      {
        instruction: 'Pass Mathura-Vrindavan Interchange toward Kuberpur Toll Plaza',
        distanceMeters: 48000,
        durationSeconds: 1800,
        maneuver: 'straight',
        roadName: 'Yamuna Expressway Agra Approach',
        location: [27.4924, 77.6737]
      },
      {
        instruction: 'Arrive at Agra Inner Ring Road & City Terminal',
        distanceMeters: 0,
        durationSeconds: 0,
        maneuver: 'arrive',
        roadName: 'Agra City Terminal',
        location: [27.1767, 78.0081]
      }
    ],
    waypoints: [
      [28.6139, 77.2090],
      [28.4744, 77.5040],
      [28.2500, 77.6200],
      [27.8900, 77.7200],
      [27.4924, 77.6737],
      [27.2200, 77.9200],
      [27.1767, 78.0081]
    ]
  },
  {
    id: 'route-chn-pud',
    name: 'East Coast Scenic Coastal Highway (Chennai to Puducherry)',
    destination: 'Puducherry Beach Promenade',
    callsign: 'COAST-ECR-02',
    roadSegment: 'SH-49 East Coast Road (ECR)',
    distanceKm: 152.0,
    estMinutes: 165,
    elevationGainM: 25,
    hazardCount: 0,
    isOfflineCached: true,
    steps: [
      {
        instruction: 'Depart Chennai Thiruvanmiyur heading south on ECR',
        distanceMeters: 8000,
        durationSeconds: 650,
        maneuver: 'depart',
        roadName: 'East Coast Road / SH-49',
        location: [12.9830, 80.2594]
      },
      {
        instruction: 'Pass Mahabalipuram UNESCO Heritage Coastal Junction',
        distanceMeters: 45000,
        durationSeconds: 2700,
        maneuver: 'straight',
        roadName: 'SH-49 Coastal Corridor',
        location: [12.6269, 80.1927]
      },
      {
        instruction: 'Proceed past Marakkanam Salt Pans and Kaliveli Lake Estuary',
        distanceMeters: 62000,
        durationSeconds: 3600,
        maneuver: 'straight',
        roadName: 'SH-49 Bay of Bengal Route',
        location: [12.2000, 79.9500]
      },
      {
        instruction: 'Arrive at Puducherry Beach Promenade & French Quarter',
        distanceMeters: 0,
        durationSeconds: 0,
        maneuver: 'arrive',
        roadName: 'Goubert Avenue / Puducherry Promenade',
        location: [11.9338, 79.8336]
      }
    ],
    waypoints: [
      [13.0827, 80.2707],
      [12.9830, 80.2594],
      [12.8300, 80.2400],
      [12.6269, 80.1927],
      [12.4200, 80.1100],
      [12.2000, 79.9500],
      [11.9338, 79.8336]
    ]
  },
  {
    id: 'route-cnd-mnl',
    name: 'Himalayan Ridge Highway (Chandigarh to Manali)',
    destination: 'Manali Mall Road & Solang Valley',
    callsign: 'HIM-NH3-03',
    roadSegment: 'NH-3 Kiratpur-Manali 4-Lane & Tunnels',
    distanceKm: 272.0,
    estMinutes: 340,
    elevationGainM: 1720,
    hazardCount: 0,
    isOfflineCached: true,
    steps: [
      {
        instruction: 'Depart Chandigarh via Himalayan Expressway toward Kiratpur Sahib',
        distanceMeters: 75000,
        durationSeconds: 4200,
        maneuver: 'depart',
        roadName: 'NH-205 / NH-3 Four-Lane',
        location: [30.7333, 76.7794]
      },
      {
        instruction: 'Pass through Bilaspur and Sundernagar Tunneled Passages',
        distanceMeters: 88000,
        durationSeconds: 5800,
        maneuver: 'straight',
        roadName: 'NH-3 Mandi Four-Lane',
        location: [31.5300, 76.9000]
      },
      {
        instruction: 'Traverse Aut Tunnel along the Beas River Gorge toward Kullu',
        distanceMeters: 65000,
        durationSeconds: 4800,
        maneuver: 'straight',
        roadName: 'NH-3 Beas River Canyon Road',
        location: [31.7500, 77.1500]
      },
      {
        instruction: 'Arrive at Manali Valley Center & Base Camp',
        distanceMeters: 0,
        durationSeconds: 0,
        maneuver: 'arrive',
        roadName: 'Manali Town Terminal',
        location: [32.2396, 77.1887]
      }
    ],
    waypoints: [
      [30.7333, 76.7794],
      [31.0500, 76.6500],
      [31.3300, 76.7600],
      [31.5300, 76.9000],
      [31.7087, 76.9320],
      [31.7500, 77.1500],
      [31.9579, 77.1095],
      [32.2396, 77.1887]
    ]
  }
];

export const POPULAR_OFFLINE_CORRIDORS: RouteOption[] = TACTICAL_ROUTES;

