/**
 * Demo API Routes
 *
 * Provides complete demo data for demo/recording purposes.
 * Returns realistic anonymous data with EXACT same structure as production API.
 * All data structures mirror the production API responses exactly.
 */

const express = require('express');
const router = express.Router();

// ===== DEMO DATA (Anonymized from production) =====

// Demo user data (based on real API structure)
const DEMO_USER = {
  id: 10001,
  company_name: 'Demo Shipping Co.',
  difficulty: 'easy',
  company_type: ['container', 'tanker'],
  status: 'active',
  co2: 52000000,
  fuel: 5000000,
  cash: 18500000000,
  hub: 'hamburg',
  points: 45,
  stock_value: 850.5,
  stock_trend: 'up',
  stock_midnight_value: 812.75,
  ipo: 1,
  reputation: 88,
  created_at: '2025-09-25T21:51:35.000000Z',
  checklist_done: 1,
  made_purchase: true,
  is_admin: 0,
  is_guest: false,
  language: 'en-GB',
  global_sales: [],
  popup_alerts: null,
  ceo_level: 28,
  experience_points: 14200,
  levelup_experience_points: 15500,
  current_level_experience_points: 13800,
  staff_training_points: 0
};

// Demo user settings (based on /api/user/get-settings)
const DEMO_USER_SETTINGS = {
  max_co2: 52000000,
  max_fuel: 5500000,
  stock_for_sale: 0,
  stock_total: 50000,
  training: 1,
  tutorial_step: 20,
  zoom: 0,
  maps: null,
  speed: null,
  metropolis: 0,
  anchor_points: 95,
  drydock_count: 58,
  ceo_level: 28,
  experience_points: 14200,
  staff_training_points: 0,
  levelup_experience_points: 15500,
  anchor_next_build: 1761128761,
  modifiers: {
    speed_up: {
      expires_at: 1758934637
    }
  }
};

// Demo alliance members (28 members - anonymized from real data)
const DEMO_ALLIANCE_MEMBERS = [
  { user_id: 10002, company_name: 'Atlantic Logistics' },
  { user_id: 10003, company_name: 'Pacific Maritime' },
  { user_id: 10004, company_name: 'Global Freight Solutions' },
  { user_id: 10005, company_name: 'Ocean Traders Inc' },
  { user_id: 10006, company_name: 'Maritime Express' },
  { user_id: 10007, company_name: 'Euro Shipping Lines' },
  { user_id: 10008, company_name: 'Nordic Freight Co' },
  { user_id: 10009, company_name: 'Cargo Masters Ltd' },
  { user_id: 10010, company_name: 'Sea Transport Alliance' },
  { user_id: 10011, company_name: 'Continental Shipping' },
  { user_id: 10012, company_name: 'Horizon Maritime' },
  { user_id: 10013, company_name: 'Blue Ocean Logistics' },
  { user_id: 10014, company_name: 'Emerald Shipping Co' },
  { user_id: 10015, company_name: 'East Coast Traders' },
  { user_id: 10016, company_name: 'West Marine Solutions' },
  { user_id: 10017, company_name: 'Southern Freight Lines' },
  { user_id: 10018, company_name: 'Northern Express Ltd' },
  { user_id: 10019, company_name: 'Coastal Transport Inc' },
  { user_id: 10020, company_name: 'Harbor Logistics' },
  { user_id: 10021, company_name: 'Maritime Ventures' },
  { user_id: 10022, company_name: 'Global Ocean Carriers' },
  { user_id: 10023, company_name: 'Intercontinental Freight' },
  { user_id: 10024, company_name: 'Seaside Shipping Co' },
  { user_id: 10025, company_name: 'Anchor Point Logistics' },
  { user_id: 10026, company_name: 'Bay Area Transport' },
  { user_id: 10027, company_name: 'Delta Shipping Lines' },
  { user_id: 10028, company_name: 'Omega Maritime Inc' },
  { user_id: 10029, company_name: 'Summit Freight Co' }
];

// Demo alliance chat (anonymized messages from real chat)
const DEMO_CHAT_MESSAGES = [
  {
    type: 'chat',
    company: 'Atlantic Logistics',
    message: 'Great to see everyone active today! Let\'s work together on the assigned ports.',
    timestamp: 'Thu, 23 Oct 2025 11:59:35 GMT',
    user_id: 10002
  },
  {
    type: 'chat',
    company: 'Pacific Maritime',
    message: 'Thanks for the port info. I\'ll be sending ships to all three ports.',
    timestamp: 'Thu, 23 Oct 2025 11:59:03 GMT',
    user_id: 10003
  },
  {
    type: 'chat',
    company: 'Global Freight Solutions',
    message: 'Fuel prices are looking good right now. Good time to stock up!',
    timestamp: 'Thu, 23 Oct 2025 11:55:41 GMT',
    user_id: 10004
  },
  {
    type: 'chat',
    company: 'Ocean Traders Inc',
    message: 'Port Hamburg is almost at capacity for today. Should we focus on Rotterdam?',
    timestamp: 'Thu, 23 Oct 2025 11:02:43 GMT',
    user_id: 10005
  },
  {
    type: 'chat',
    company: 'Maritime Express',
    message: 'Current demand is at 180k tons',
    timestamp: 'Thu, 23 Oct 2025 05:29:43 GMT',
    user_id: 10006
  },
  {
    type: 'chat',
    company: 'Euro Shipping Lines',
    message: 'Thanks for the update!',
    timestamp: 'Thu, 23 Oct 2025 04:00:03 GMT',
    user_id: 10007
  },
  {
    type: 'chat',
    company: 'Nordic Freight Co',
    message: 'You have to calculate for ship size and trip length to optimize port allocation.',
    timestamp: 'Thu, 23 Oct 2025 03:55:56 GMT',
    user_id: 10008
  },
  {
    type: 'chat',
    company: 'Cargo Masters Ltd',
    message: 'Yes, the more people contributing to the 3 ports daily will improve our alliance ranking.',
    timestamp: 'Thu, 23 Oct 2025 03:37:26 GMT',
    user_id: 10009
  },
  {
    type: 'chat',
    company: 'Sea Transport Alliance',
    message: 'Question about route planning: If a port has 350k tons demand and vessels en-route already have 500k capacity, should I hold back my ships?',
    timestamp: 'Thu, 23 Oct 2025 03:21:12 GMT',
    user_id: 10010
  },
  {
    type: 'chat',
    company: 'Continental Shipping',
    message: 'We used to have a top 3 position in all three ports.',
    timestamp: 'Thu, 23 Oct 2025 02:58:08 GMT',
    user_id: 10011
  },
  {
    type: 'chat',
    company: 'Horizon Maritime',
    message: 'The bigger ports are tough because the big teams play them. These smaller ports are easier to dominate.',
    timestamp: 'Thu, 23 Oct 2025 02:57:44 GMT',
    user_id: 10012
  },
  {
    type: 'chat',
    company: 'Blue Ocean Logistics',
    message: 'Do the port sizes matter or are we just trying to be top company for those ports?',
    timestamp: 'Thu, 23 Oct 2025 02:53:51 GMT',
    user_id: 10013
  },
  {
    type: 'chat',
    company: 'Emerald Shipping Co',
    message: 'Just ordered a $22M ship and a $10M tanker. Keep growing!',
    timestamp: 'Thu, 23 Oct 2025 02:22:43 GMT',
    user_id: 10014
  },
  {
    type: 'chat',
    company: 'East Coast Traders',
    message: 'I\'m committed for the long haul!',
    timestamp: 'Thu, 23 Oct 2025 02:21:12 GMT',
    user_id: 10015
  },
  {
    type: 'chat',
    company: 'West Marine Solutions',
    message: 'I\'ll do my best to contribute!',
    timestamp: 'Thu, 23 Oct 2025 02:20:03 GMT',
    user_id: 10016
  },
  {
    type: 'chat',
    company: 'Southern Freight Lines',
    message: 'If we want to promote next season we need strong players who are growing their fleet fast.',
    timestamp: 'Thu, 23 Oct 2025 02:14:19 GMT',
    user_id: 10017
  },
  {
    type: 'feed',
    feedType: 'route_completed',
    company: 'Northern Express Ltd',
    timestamp: 'Thu, 23 Oct 2025 02:10:00 GMT'
  },
  {
    type: 'chat',
    company: 'Coastal Transport Inc',
    message: 'When should we start thinking about getting our first tanker?',
    timestamp: 'Wed, 22 Oct 2025 21:54:09 GMT',
    user_id: 10019
  },
  {
    type: 'chat',
    company: 'Harbor Logistics',
    message: 'Thanks for this info, rerouting more ships now.',
    timestamp: 'Wed, 22 Oct 2025 21:41:18 GMT',
    user_id: 10020
  },
  {
    type: 'chat',
    company: 'Maritime Ventures',
    message: 'Let me re-route my fleet tonight.',
    timestamp: 'Wed, 22 Oct 2025 20:54:05 GMT',
    user_id: 10021
  },
  {
    type: 'chat',
    company: 'Global Ocean Carriers',
    message: 'The amount that you send to the port counts (TEU/BBL). Daily demand per port decreases throughout the day until night.',
    timestamp: 'Wed, 22 Oct 2025 20:51:26 GMT',
    user_id: 10022
  },
  {
    type: 'chat',
    company: 'Intercontinental Freight',
    message: 'Every ship counts towards the port bonus, not just tankers.',
    timestamp: 'Wed, 22 Oct 2025 20:49:36 GMT',
    user_id: 10023
  },
  {
    type: 'chat',
    company: 'Seaside Shipping Co',
    message: 'For those who don\'t know: Every alliance can receive up to three advantage levels if they are top 3 in three ports at season end. Our targeted ports are: Hamburg, Rotterdam, and Antwerp.',
    timestamp: 'Wed, 22 Oct 2025 20:48:34 GMT',
    user_id: 10024
  },
  {
    type: 'chat',
    company: 'Anchor Point Logistics',
    message: 'I see we\'re falling behind on our target ports. We should increase contribution.',
    timestamp: 'Wed, 22 Oct 2025 20:47:57 GMT',
    user_id: 10025
  },
  {
    type: 'feed',
    feedType: 'member_joined',
    company: 'Bay Area Transport',
    timestamp: 'Wed, 22 Oct 2025 19:30:00 GMT'
  }
];

// Demo vessels (2 vessels based on real structure)
const DEMO_VESSELS = [
  {
    id: 17001,
    name: 'MV Atlantic Star',
    type_name: 'Feeder',
    engine_type: 'dac_22_95',
    current_port_code: 'hamburg',
    imo: '50001',
    mmsi: 15000001,
    price: 1650000,
    year: 2008,
    length: 300,
    width: 0,
    gearless: 0,
    range: 1000,
    kw: 1000,
    max_speed: 20,
    capacity_max: { dry: 120, refrigerated: 120 },
    capacity: { dry: 100, refrigerated: 95 },
    capacity_type: 'container',
    prices: { dry: 510, refrigerated: 510 },
    co2_factor: 1,
    fuel_factor: 1.39,
    fuel_capacity: 2400,
    antifouling: null,
    bulbous_bow: 0,
    enhanced_thrusters: 0,
    wear: '2.00',
    hours_between_service: 190,
    maintenance_start_time: 1759013368,
    maintenance_end_time: '1759016968',
    next_route_is_maintenance: null,
    hours_until_check: 380,
    travelled_hours: 350,
    total_distance_traveled: 235000,
    route_guards: 0,
    route_origin: 'rotterdam',
    route_destination: 'hamburg',
    route_distance: 450,
    route_speed: 10,
    route_name: 'route001',
    route_end_time: 1761235715,
    route_dry_operation: 0,
    time_acquired: 1758838031,
    time_arrival: 0,
    type: 'compressed/container/220-TEU.jpg',
    status: 'port',
    perks: null,
    is_parked: false,
    event_coordinates: null,
    event_timestamp: null,
    event_type: null,
    delivery_price: null,
    routes: [
      {
        route_id: 50001,
        channels_ids: '1',
        path: [
          { lon: 4.5, lat: 51.9 },
          { lon: 4.6, lat: 52.0 },
          { lon: 5.0, lat: 52.5 },
          { lon: 6.0, lat: 53.0 },
          { lon: 7.5, lat: 53.5 },
          { lon: 9.0, lat: 53.5 },
          { lon: 9.98, lat: 53.55 }
        ],
        distances: [15, 50, 80, 120, 100, 70, 15],
        total_distance: 450,
        hijacking_risk: 0,
        duration: null,
        reversed: false,
        origin: 'rotterdam',
        destination: 'hamburg',
        dry_operation: null,
        name: 'route001'
      }
    ],
    active_route: {
      route_id: 50001,
      origin: 'rotterdam',
      destination: 'hamburg',
      reversed: false,
      duration: 3200,
      name: 'route001',
      loading_time: 10,
      unloading_time: 40,
      dry_dock_auto_return: null,
      drydock_on_arrival: null,
      path: [
        { lon: 4.5, lat: 51.9 },
        { lon: 4.6, lat: 52.0 },
        { lon: 5.0, lat: 52.5 },
        { lon: 6.0, lat: 53.0 },
        { lon: 7.5, lat: 53.5 },
        { lon: 9.0, lat: 53.5 },
        { lon: 9.98, lat: 53.55 }
      ],
      distances: [15, 50, 80, 120, 100, 70, 15],
      total_distance: 450,
      loading_time_left: 0,
      arrival_time_left: 320,
      unloading_time_left: 360
    },
    arrives_in: 360
  },
  {
    id: 17002,
    name: 'MV Pacific Trader',
    type_name: 'Feeder',
    engine_type: 'dac_22_95',
    current_port_code: 'antwerp',
    imo: '50002',
    mmsi: 15000002,
    price: 580000,
    year: 1999,
    length: 400,
    width: 0,
    gearless: 0,
    range: 1150,
    kw: 1025,
    max_speed: 10,
    capacity_max: { dry: 40, refrigerated: 40 },
    capacity: { dry: 38, refrigerated: 35 },
    capacity_type: 'container',
    prices: { dry: 521, refrigerated: 521 },
    co2_factor: 1,
    fuel_factor: 1.12,
    fuel_capacity: 2500,
    antifouling: null,
    bulbous_bow: 0,
    enhanced_thrusters: 0,
    wear: '2.00',
    hours_between_service: 325,
    maintenance_start_time: 0,
    maintenance_end_time: null,
    next_route_is_maintenance: null,
    hours_until_check: 120,
    travelled_hours: 530,
    total_distance_traveled: 240000,
    route_guards: 0,
    route_origin: 'hamburg',
    route_destination: 'antwerp',
    route_distance: 520,
    route_speed: 5,
    route_name: 'route002',
    route_end_time: 1761243605,
    route_dry_operation: 0,
    time_acquired: 1758843974,
    time_arrival: 0,
    type: 'compressed/upload/75-TEU.jpg',
    status: 'port',
    perks: null,
    is_parked: false,
    event_coordinates: { lon: 5.5, lat: 52.2 },
    event_timestamp: 0,
    event_type: 1,
    delivery_price: null,
    routes: [
      {
        route_id: 50002,
        channels_ids: 'NULL',
        path: [
          { lon: 9.98, lat: 53.55 },
          { lon: 9.0, lat: 53.0 },
          { lon: 7.5, lat: 52.5 },
          { lon: 6.0, lat: 52.0 },
          { lon: 5.0, lat: 51.8 },
          { lon: 4.4, lat: 51.22 }
        ],
        distances: [90, 120, 100, 80, 70, 60],
        total_distance: 520,
        hijacking_risk: 0,
        duration: null,
        reversed: true,
        origin: 'antwerp',
        destination: 'hamburg',
        dry_operation: null,
        name: 'route002'
      }
    ],
    active_route: {
      route_id: 50002,
      origin: 'hamburg',
      destination: 'antwerp',
      reversed: true,
      duration: 7200,
      name: 'route002',
      loading_time: 10,
      unloading_time: 40,
      dry_dock_auto_return: null,
      drydock_on_arrival: null,
      path: [
        { lon: 9.98, lat: 53.55 },
        { lon: 9.0, lat: 53.0 },
        { lon: 7.5, lat: 52.5 },
        { lon: 6.0, lat: 52.0 },
        { lon: 5.0, lat: 51.8 },
        { lon: 4.4, lat: 51.22 }
      ],
      distances: [90, 120, 100, 80, 70, 60],
      total_distance: 520,
      loading_time_left: 0,
      arrival_time_left: 280,
      unloading_time_left: 320
    },
    arrives_in: 320
  }
];

// Demo bunker prices (based on real API structure with 24 time slots)
// CURRENT PRICE IS GOOD (370 < 400 threshold) to trigger alert on load
const DEMO_BUNKER_PRICES = {
  prices: [
    { fuel_price: 370, co2_price: 6, time: '04:30', day: 23 },
    { fuel_price: 380, co2_price: 7, time: '05:00', day: 23 },
    { fuel_price: 950, co2_price: 14, time: '05:30', day: 23 },
    { fuel_price: 760, co2_price: 22, time: '06:00', day: 23 },
    { fuel_price: 370, co2_price: 6, time: '06:30', day: 23 },
    { fuel_price: 860, co2_price: 19, time: '07:00', day: 23 },
    { fuel_price: 980, co2_price: 25, time: '07:30', day: 23 },
    { fuel_price: 470, co2_price: 16, time: '08:00', day: 23 },
    { fuel_price: 420, co2_price: 5, time: '08:30', day: 23 },
    { fuel_price: 990, co2_price: 12, time: '09:00', day: 23 },
    { fuel_price: 960, co2_price: 24, time: '09:30', day: 23 },
    { fuel_price: 370, co2_price: 15, time: '10:00', day: 23 },
    { fuel_price: 600, co2_price: 15, time: '10:30', day: 23 },
    { fuel_price: 950, co2_price: 10, time: '11:00', day: 23 },
    { fuel_price: 720, co2_price: 6, time: '11:30', day: 23 },
    { fuel_price: 970, co2_price: 8, time: '12:00', day: 23 },
    { fuel_price: 650, co2_price: 17, time: '12:30', day: 23 },
    { fuel_price: 950, co2_price: 19, time: '13:00', day: 23 },
    { fuel_price: 920, co2_price: 12, time: '13:30', day: 23 },
    { fuel_price: 770, co2_price: 23, time: '14:00', day: 23 },
    { fuel_price: 460, co2_price: 11, time: '14:30', day: 23 },
    { fuel_price: 530, co2_price: 10, time: '15:00', day: 23 },
    { fuel_price: 730, co2_price: 8, time: '15:30', day: 23 },
    { fuel_price: 820, co2_price: 9, time: '16:00', day: 23 }
  ]
};

// Demo contacts (based on real API structure)
const DEMO_CONTACTS = [
  {
    id: 10030,
    company_name: 'Alpha Transport Ltd',
    difficulty: 'easy',
    company_type: ['container', 'tanker'],
    status: 'active',
    hub: 'rotterdam',
    user_image: null,
    cash: 12500000,
    fuel: 9800000,
    co2: 16500000,
    points: 52,
    stock: 105.25,
    stock_trend: 'up',
    language: 'en-GB',
    reputation: 58,
    created_at: '2025-10-10T22:33:02.000000Z',
    is_admin: 0,
    time_last_login: 1761203675
  },
  {
    id: 10031,
    company_name: 'Beta Shipping Inc',
    difficulty: 'easy',
    company_type: ['container', 'tanker'],
    status: 'active',
    hub: 'hamburg',
    user_image: null,
    cash: 245000000,
    fuel: 12000,
    co2: 850000,
    points: 175,
    stock: 4850.25,
    stock_trend: 'same',
    language: 'en-GB',
    reputation: 45,
    created_at: '2023-02-25T06:42:15.000000Z',
    is_admin: 0,
    time_last_login: 1760244457
  }
];

// Demo alliance contacts (subset from DEMO_ALLIANCE_MEMBERS with full details)
const DEMO_ALLIANCE_CONTACTS = [
  {
    id: 10002,
    company_name: 'Atlantic Logistics',
    difficulty: 'easy',
    company_type: ['container', 'tanker'],
    status: 'active',
    hub: 'amsterdam',
    user_image: null,
    cash: 4500000000,
    fuel: 280000000,
    co2: 720000000,
    points: 550,
    stock: 5100.25,
    stock_trend: 'down',
    language: 'en-GB',
    reputation: 75,
    created_at: '2024-02-22T11:04:05.000000Z',
    is_admin: 0,
    time_last_login: 1761191140
  },
  {
    id: 10003,
    company_name: 'Pacific Maritime',
    difficulty: 'easy',
    company_type: ['container', 'tanker'],
    status: 'active',
    hub: 'rotterdam',
    user_image: null,
    cash: 320000000,
    fuel: 4200000,
    co2: 1400000000,
    points: 1850,
    stock: 3050.5,
    stock_trend: 'up',
    language: 'en-GB',
    reputation: 87,
    created_at: '2025-09-07T19:34:54.000000Z',
    is_admin: 0,
    time_last_login: 1761185516
  },
  {
    id: 10004,
    company_name: 'Global Freight Solutions',
    difficulty: 'easy',
    company_type: ['container'],
    status: 'active',
    hub: 'hamburg',
    user_image: null,
    cash: 3800000,
    fuel: 51000000,
    co2: 105000000,
    points: 610,
    stock: null,
    stock_trend: null,
    language: 'en-GB',
    reputation: 89,
    created_at: '2025-09-23T17:49:06.000000Z',
    is_admin: 0,
    time_last_login: 1761196501
  }
];

// Demo messenger chats (based on real API structure)
const DEMO_MESSENGER_CHATS = [
  {
    id: 116001,
    subject: 'Route coordination',
    last_message: 'Hey, are we coordinating routes this week?',
    time_last_message: 1760986229,
    new: false,
    participants_string: 'Alpha Transport Ltd',
    messages: []
  },
  {
    system_chat: true,
    id: 12808001,
    values: { amount: 1, comment: 'Thanks everyone for the contributions!' },
    subject: null,
    body: 'alliance/coop/successful_donation_with_message',
    time_last_message: 1760984946,
    new: false,
    read_at: 1760986046,
    display_at: 1760984946,
    participants_string: 'Gameplay'
  },
  {
    system_chat: true,
    id: 12785001,
    values: {
      case_id: 1023001,
      company_name: 'Demo Shipping Co.',
      vessel_name: 'MV Atlantic Star',
      user_vessel_id: 17001,
      tr_danger_zone: 'mediterranean_sea',
      requested_amount: 1100000
    },
    subject: 'vessel_got_hijacked',
    body: 'vessel_got_hijacked',
    time_last_message: 1760763352,
    new: false,
    read_at: 1760763365,
    display_at: null,
    participants_string: 'Gameplay'
  },
  {
    system_chat: true,
    id: 12770001,
    values: {
      stockOwner: 'Beta Shipping Inc',
      stockAmount: 25000,
      totalAmount: 10400000
    },
    subject: null,
    body: 'user_bought_stock',
    time_last_message: 1760638423,
    new: false,
    read_at: 1760679060,
    display_at: null,
    participants_string: 'Gameplay'
  },
  {
    system_chat: true,
    id: 12756001,
    values: {
      stockOwner: 'Gamma Logistics',
      stockAmount: 15000,
      totalAmount: 945000
    },
    subject: null,
    body: 'user_sold_stock',
    time_last_message: 1760566835,
    new: false,
    read_at: 1760610779,
    display_at: null,
    participants_string: 'Gameplay'
  },
  {
    system_chat: true,
    id: 12543001,
    values: { alliance_name: 'Maritime Alliance' },
    subject: null,
    body: 'user_accepted_to_join_alliance_message',
    time_last_message: 1759244946,
    new: false,
    read_at: 1759250021,
    display_at: 1759244946,
    participants_string: 'Gameplay'
  },
  {
    system_chat: true,
    id: 12535001,
    values: null,
    subject: null,
    body: 'intro_pm_6',
    time_last_message: 1759235733,
    new: false,
    read_at: 1759244392,
    display_at: 1759235733,
    participants_string: 'Gameplay'
  }
];

// Demo marketing campaigns (based on real API structure)
const DEMO_MARKETING_CAMPAIGNS = {
  marketing_campaigns: [
    { id: 1, name: 'campaign_1', min_efficiency: 5, max_efficiency: 7, campaign_duration: 4, price: 612509, option_name: 'reputation' },
    { id: 2, name: 'campaign_1', min_efficiency: 5, max_efficiency: 7, campaign_duration: 8, price: 1041265, option_name: 'reputation' },
    { id: 3, name: 'campaign_1', min_efficiency: 5, max_efficiency: 7, campaign_duration: 12, price: 1470021, option_name: 'reputation' },
    { id: 4, name: 'campaign_1', min_efficiency: 5, max_efficiency: 7, campaign_duration: 16, price: 2058562, option_name: 'reputation' },
    { id: 5, name: 'campaign_1', min_efficiency: 5, max_efficiency: 7, campaign_duration: 20, price: 2327533, option_name: 'reputation' },
    { id: 6, name: 'campaign_1', min_efficiency: 5, max_efficiency: 7, campaign_duration: 24, price: 2756290, option_name: 'reputation' },
    { id: 7, name: 'campaign_2', min_efficiency: 11, max_efficiency: 14, campaign_duration: 4, price: 918763, option_name: 'reputation' },
    { id: 8, name: 'campaign_2', min_efficiency: 11, max_efficiency: 14, campaign_duration: 8, price: 1561898, option_name: 'reputation' },
    { id: 9, name: 'campaign_2', min_efficiency: 11, max_efficiency: 14, campaign_duration: 12, price: 2205032, option_name: 'reputation' },
    { id: 10, name: 'campaign_2', min_efficiency: 11, max_efficiency: 14, campaign_duration: 16, price: 3087843, option_name: 'reputation' },
    { id: 11, name: 'campaign_2', min_efficiency: 11, max_efficiency: 14, campaign_duration: 20, price: 3491301, option_name: 'reputation' },
    { id: 12, name: 'campaign_2', min_efficiency: 11, max_efficiency: 14, campaign_duration: 24, price: 4134435, option_name: 'reputation' },
    { id: 13, name: 'campaign_3', min_efficiency: 18, max_efficiency: 22, campaign_duration: 4, price: 1173975, option_name: 'reputation' },
    { id: 14, name: 'campaign_3', min_efficiency: 18, max_efficiency: 22, campaign_duration: 8, price: 1995758, option_name: 'reputation' },
    { id: 15, name: 'campaign_3', min_efficiency: 18, max_efficiency: 22, campaign_duration: 12, price: 2817541, option_name: 'reputation' },
    { id: 16, name: 'campaign_3', min_efficiency: 18, max_efficiency: 22, campaign_duration: 16, price: 3945578, option_name: 'reputation' },
    { id: 17, name: 'campaign_3', min_efficiency: 18, max_efficiency: 22, campaign_duration: 20, price: 4461107, option_name: 'reputation' },
    { id: 18, name: 'campaign_4', min_efficiency: 25, max_efficiency: 30, campaign_duration: 4, price: 1408770, option_name: 'reputation' },
    { id: 19, name: 'campaign_4', min_efficiency: 25, max_efficiency: 30, campaign_duration: 8, price: 2394910, option_name: 'reputation' },
    { id: 20, name: 'campaign_4', min_efficiency: 25, max_efficiency: 30, campaign_duration: 12, price: 3381049, option_name: 'reputation' },
    { id: 21, name: 'campaign_4', min_efficiency: 25, max_efficiency: 30, campaign_duration: 16, price: 4734694, option_name: 'reputation' },
    { id: 22, name: 'campaign_4', min_efficiency: 25, max_efficiency: 30, campaign_duration: 20, price: 5353328, option_name: 'reputation' },
    { id: 23, name: 'campaign_4', min_efficiency: 25, max_efficiency: 30, campaign_duration: 24, price: 6339467, option_name: 'reputation' },
    { id: 24, name: 'campaign_5', min_efficiency: 10, max_efficiency: 15, campaign_duration: 24, price: 3100826, option_name: 'awareness' },
    { id: 25, name: 'campaign_6', min_efficiency: 7, max_efficiency: 10, campaign_duration: 12, price: 918763, option_name: 'green' }
  ],
  active_campaigns: [
    { id: 25, name: 'campaign_6', min_efficiency: 7, max_efficiency: 10, campaign_duration: 12, price: 0, option_name: 'green', end_time: 1761260967, increase: 8, duration: 12 },
    { id: 24, name: 'campaign_5', min_efficiency: 10, max_efficiency: 15, campaign_duration: 24, price: 0, option_name: 'awareness', end_time: 1761267720, increase: 10, duration: 24 },
    { id: 23, name: 'campaign_4', min_efficiency: 25, max_efficiency: 30, campaign_duration: 24, price: 0, option_name: 'reputation', end_time: 1761248614, increase: 25, duration: 24 }
  ]
};

// Demo settings (based on real API structure)
const DEMO_SETTINGS = {
  fuelThreshold: 400,
  co2Threshold: 7,
  maintenanceThreshold: 20,
  autoRebuyFuel: true,
  autoRebuyFuelUseAlert: false,
  autoRebuyFuelThreshold: 600,
  autoRebuyCO2: true,
  autoRebuyCO2UseAlert: false,
  autoRebuyCO2Threshold: 10,
  autoDepartAll: true,
  autoBulkRepair: true,
  autoRepairInterval: '0-1',
  autoCampaignRenewal: true,
  autoPilotNotifications: true,
  autoDepartUseRouteDefaults: true,
  minVesselUtilization: 45,
  autoVesselSpeed: 50
};

// Demo coop data (based on real API structure)
const DEMO_COOP_DATA = {
  coop: {
    available: 0,
    cap: 68,
    sent_this_season: 136,
    received_this_season: 25,
    sent_historical: 1000,
    received_historical: 400
  },
  members_coop: [
    {
      user_id: 10002,
      enabled: true,
      sent_this_season: 136,
      sent_last_season: 600,
      sent_cargo_load_last_season: 800000,
      received_this_season: 5,
      sent_historical: 3200,
      received_historical: 3300,
      total_vessels: 205,
      fuel: 280000000,
      donations_this_season: 0,
      donations_last_season: 0,
      donations_historical: 550,
      has_real_purchase: false
    },
    {
      user_id: 10003,
      enabled: true,
      sent_this_season: 136,
      sent_last_season: 520,
      sent_cargo_load_last_season: 385000,
      received_this_season: 21,
      sent_historical: 2400,
      received_historical: 530,
      total_vessels: 75,
      fuel: 420000,
      donations_this_season: 0,
      donations_last_season: 0,
      donations_historical: 0,
      has_real_purchase: false
    },
    {
      user_id: 10004,
      enabled: true,
      sent_this_season: 0,
      sent_last_season: 0,
      sent_cargo_load_last_season: 0,
      received_this_season: 16,
      sent_historical: 30,
      received_historical: 175,
      total_vessels: 10,
      fuel: 42000000,
      donations_this_season: 0,
      donations_last_season: 0,
      donations_historical: 0,
      has_real_purchase: false
    }
  ]
};

// ===== ROUTES =====

// User settings (get-settings endpoint)
router.get('/user/get-settings', (req, res) => {
  res.json({
    data: {
      settings: DEMO_USER_SETTINGS,
    },
    user: DEMO_USER
  });
});

// Alliance members
router.get('/alliance-members', (req, res) => {
  res.json(DEMO_ALLIANCE_MEMBERS);
});

// Alliance chat
router.get('/chat', (req, res) => {
  res.json(DEMO_CHAT_MESSAGES);
});

// Send alliance message (just acknowledge)
router.post('/send-message', (req, res) => {
  const { message } = req.body;

  const newMessage = {
    type: 'chat',
    company: DEMO_USER.company_name,
    message: message,
    timestamp: new Date().toUTCString(),
    user_id: DEMO_USER.id
  };

  DEMO_CHAT_MESSAGES.push(newMessage);

  if (DEMO_CHAT_MESSAGES.length > 50) {
    DEMO_CHAT_MESSAGES.shift();
  }

  res.json({ success: true, message: newMessage });
});

// Vessels
router.get('/vessel/get-vessels', (req, res) => {
  res.json({ vessels: DEMO_VESSELS });
});

// Assigned ports (for auto-depart)
router.get('/port/get-assigned-ports', (req, res) => {
  const DEMO_ASSIGNED_PORTS = [
    {
      code: 'hamburg',
      name: 'Hamburg',
      container_demand: 150000,
      container_consumed: 85000,
      tanker_demand: 250000,
      tanker_consumed: 120000
    },
    {
      code: 'rotterdam',
      name: 'Rotterdam',
      container_demand: 180000,
      container_consumed: 95000,
      tanker_demand: 300000,
      tanker_consumed: 150000
    },
    {
      code: 'antwerp',
      name: 'Antwerp',
      container_demand: 120000,
      container_consumed: 60000,
      tanker_demand: 200000,
      tanker_consumed: 90000
    }
  ];

  res.json({ ports: DEMO_ASSIGNED_PORTS });
});

// Bunker prices (generate with current time slot)
router.get('/bunker/get-prices', (req, res) => {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const currentSlot = `${String(utcHours).padStart(2, '0')}:${utcMinutes < 30 ? '00' : '30'}`;

  // Find current price or use first price as fallback
  let currentPrice = DEMO_BUNKER_PRICES.prices.find(p => p.time === currentSlot);
  if (!currentPrice) {
    currentPrice = { fuel_price: 370, co2_price: 6, time: currentSlot, day: now.getUTCDate() };
  }

  // Put current price first, then rest
  const prices = [
    currentPrice,
    ...DEMO_BUNKER_PRICES.prices.filter(p => p.time !== currentSlot).slice(0, 23)
  ];

  res.json({
    data: { prices },
    user: DEMO_USER
  });
});

// Purchase fuel
router.post('/bunker/purchase-fuel', (req, res) => {
  const { amount } = req.body;
  const currentPrice = DEMO_BUNKER_PRICES.prices[0].fuel_price;
  const cost = amount * currentPrice;

  DEMO_USER.fuel = Math.min(DEMO_USER.fuel + amount, DEMO_USER_SETTINGS.max_fuel);
  DEMO_USER.cash -= cost;

  res.json({
    success: true,
    new_fuel: DEMO_USER.fuel,
    new_balance: DEMO_USER.cash
  });
});

// Purchase CO2
router.post('/bunker/purchase-co2', (req, res) => {
  const { amount } = req.body;
  const currentPrice = DEMO_BUNKER_PRICES.prices[0].co2_price;
  const cost = amount * currentPrice;

  DEMO_USER.co2 = Math.min(DEMO_USER.co2 + amount, DEMO_USER_SETTINGS.max_co2);
  DEMO_USER.cash -= cost;

  res.json({
    success: true,
    new_co2: DEMO_USER.co2,
    new_balance: DEMO_USER.cash
  });
});

// Depart all vessels
router.post('/route/depart-all', (req, res) => {
  let count = 0;

  DEMO_VESSELS.forEach(vessel => {
    if (vessel.status === 'port' && !vessel.is_parked) {
      vessel.status = 'enroute';
      count++;
    }
  });

  res.json({
    success: true,
    departed_count: count
  });
});

// Contacts
router.get('/contact/get-contacts', (req, res) => {
  res.json({
    contacts: DEMO_CONTACTS,
    alliance_contacts: DEMO_ALLIANCE_CONTACTS,
    own_user_id: DEMO_USER.id,
    own_company_name: DEMO_USER.company_name
  });
});

// Messenger chats
router.get('/messenger/get-chats', (req, res) => {
  res.json({
    chats: DEMO_MESSENGER_CHATS,
    own_user_id: DEMO_USER.id,
    own_company_name: DEMO_USER.company_name
  });
});

// Private messages (POST)
router.post('/messenger/get-messages', (req, res) => {
  const { chat_id } = req.body;

  const demoMessages = [
    {
      id: 5001,
      from_user_id: 10030,
      to_user_id: DEMO_USER.id,
      message: 'Hey, have you checked the fuel prices today?',
      timestamp: Date.now() - 900000,
      read: true
    },
    {
      id: 5002,
      from_user_id: DEMO_USER.id,
      to_user_id: 10030,
      message: 'Yes, looks like a good time to stock up!',
      timestamp: Date.now() - 720000,
      read: true
    }
  ];

  res.json({ messages: demoMessages });
});

// Send private message
router.post('/messenger/send-private', (req, res) => {
  const { recipient_id, message } = req.body;

  const newMessage = {
    id: Date.now(),
    from_user_id: DEMO_USER.id,
    to_user_id: recipient_id,
    message: message,
    timestamp: Date.now(),
    read: false
  };

  res.json({
    success: true,
    message: newMessage
  });
});

// Marketing campaigns
router.get('/marketing/get-campaigns', (req, res) => {
  res.json({
    data: DEMO_MARKETING_CAMPAIGNS,
    user: DEMO_USER
  });
});

// Settings - Get
router.get('/settings', (req, res) => {
  res.json(DEMO_SETTINGS);
});

// Settings - Save (just acknowledge)
router.post('/settings', (req, res) => {
  res.json({ success: true });
});

// Coop data
router.get('/coop/data', (req, res) => {
  res.json({
    data: DEMO_COOP_DATA,
    user: DEMO_USER
  });
});

module.exports = router;
