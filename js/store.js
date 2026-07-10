// Estado compartido de toda la app (Datos, Carrera, Score, Ajustes).
// Los módulos de pantalla mutan store.state directamente (arrays/objetos anidados)
// y llaman a store.notify() para persistir + re-renderizar, igual que hacían
// los mockups originales con sus variables locales.

const STORAGE_KEY = "millas_state_v1";
const LEGACY_KEY = "millas_datos_v1";

function defaultState(){
  return {
    days: {
      "Etapa 1": [
        {id:1, itemType:"CH", nombre:"CH Largada A", refId:100, offset:"000000"},
        {id:2, itemType:"PCSET", primerNumero:1, cantidad:3, origen:"libre", refId:null, chId:null, tiempos:["000011","000027","000013"]},
        {id:3, itemType:"CS", nombre:"1 · Parador El Mangrullo", refId:100, offset:"015500"},
        {id:4, itemType:"CH", nombre:"CH Cruce de Sañico", refId:100, offset:"040800"},
        {id:5, itemType:"CH", nombre:"Relargada B", refId:101, offset:"000000"}
      ],
      "Etapa 2": [
        {id:6, itemType:"CH", nombre:"CH Largada A", refId:102, offset:"000000"}
      ]
    },
    dayHorarios: {
      "Etapa 1": [ {id:100, nombre:"Largada A", hora:"080000"}, {id:101, nombre:"Relargada B", hora:"141500"} ],
      "Etapa 2": [ {id:102, nombre:"Largada A", hora:"080000"} ]
    },
    diasMeta: { "Etapa 1": {aplicaDescarte:true}, "Etapa 2": {aplicaDescarte:true} },
    nextId: 7,
    nextHorarioId: 200,
    ui: { activeDayDatos: "Etapa 1", activeDayScore: "Etapa 1", activeDayCarrera: "Etapa 1" },
    ajustes: {
      numeroAuto: "12",
      anioAuto: "1965",
      metodoSync: "manual",
      clockOffsetMs: 0,
      calibradoAt: null,
      dualPulsadores: false,
      toleranciaMs: 300,
      umbralChicharraSeg: 10,
      pulsadorCopilotoConectado: true,
      pulsadorPilotoConectado: false
    },
    carrera: {
      pcRuntime: {},   // { [pcKey]: { startInstant: epochMs } }
      pcResults: {}    // { [dayName]: [ {pc, delta} ... ] }
    }
  };
}

function mergeDefaults(parsed){
  const base = defaultState();
  return {
    ...base,
    ...parsed,
    days: parsed.days || base.days,
    dayHorarios: parsed.dayHorarios || base.dayHorarios,
    diasMeta: parsed.diasMeta || base.diasMeta,
    ui: { ...base.ui, ...(parsed.ui || {}) },
    ajustes: { ...base.ajustes, ...(parsed.ajustes || {}) },
    carrera: {
      pcRuntime: (parsed.carrera && parsed.carrera.pcRuntime) || {},
      pcResults: (parsed.carrera && parsed.carrera.pcResults) || {}
    }
  };
}

function migrateLegacy(legacy){
  const base = defaultState();
  if(legacy.days) base.days = legacy.days;
  if(legacy.dayHorarios) base.dayHorarios = legacy.dayHorarios;
  if(legacy.nextId) base.nextId = legacy.nextId;
  if(legacy.nextHorarioId) base.nextHorarioId = legacy.nextHorarioId;
  const dayNames = Object.keys(base.days);
  base.diasMeta = {};
  dayNames.forEach(d => { base.diasMeta[d] = {aplicaDescarte:true}; });
  const active = legacy.activeDay || dayNames[0];
  base.ui.activeDayDatos = active;
  base.ui.activeDayScore = active;
  base.ui.activeDayCarrera = active;
  return base;
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return mergeDefaults(JSON.parse(raw));
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if(legacyRaw) return migrateLegacy(JSON.parse(legacyRaw));
  }catch(e){ /* almacenamiento corrupto o no disponible, arrancamos de cero */ }
  return defaultState();
}

export const store = {
  state: loadState(),
  listeners: [],

  subscribe(fn){
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  },

  notify(){
    this.save();
    this.listeners.forEach(fn => fn(this.state));
  },

  save(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
    catch(e){ /* sin almacenamiento disponible, seguimos solo en memoria */ }
  },

  ensureDay(name){
    if(!this.state.days[name]) this.state.days[name] = [];
    if(!this.state.dayHorarios[name]) this.state.dayHorarios[name] = [];
    if(!this.state.diasMeta[name]) this.state.diasMeta[name] = {aplicaDescarte:true};
  },

  resetRaceData(){
    const fresh = defaultState();
    this.state.days = { "Etapa 1": [] };
    this.state.dayHorarios = { "Etapa 1": [] };
    this.state.diasMeta = { "Etapa 1": {aplicaDescarte:true} };
    this.state.nextId = 1;
    this.state.nextHorarioId = 100;
    this.state.ui = { activeDayDatos: "Etapa 1", activeDayScore: "Etapa 1", activeDayCarrera: "Etapa 1" };
    this.state.carrera = { pcRuntime: {}, pcResults: {} };
    this.notify();
  }
};
