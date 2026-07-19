// Estado compartido de toda la app (Datos, Carrera, Score, Ajustes).
// Los módulos de pantalla mutan store.state directamente (arrays/objetos anidados)
// y llaman a store.notify() para persistir + re-renderizar, igual que hacían
// los mockups originales con sus variables locales.

const STORAGE_KEY = "millas_state_v1";
const LEGACY_KEY = "millas_datos_v1";

function defaultState(){
  return {
    days: {},
    dayHorarios: {},
    diasMeta: {},
    nextId: 1,
    nextHorarioId: 100,
    ui: { activeDayDatos: null, activeDayScore: null, activeDayCarrera: null },
    ajustes: {
      numeroAuto: "12",
      anioAuto: "1965",
      metodoSync: "manual",
      clockOffsetMs: 0,
      calibradoAt: null,
      dualPulsadores: false,
      toleranciaMs: 300,
      umbralChicharraSeg: 10,
      // Código de la tecla (KeyboardEvent.code) que manda cada pulsador
      // Bluetooth, emparejado a nivel sistema operativo (como un teclado
      // externo) — no vía Web Bluetooth, que no existe en iOS y excluye
      // el perfil HID que usan la mayoría de estos dispositivos.
      pulsadorCopilotoKey: null,
      pulsadorPilotoKey: null
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
    this.state.days = {};
    this.state.dayHorarios = {};
    this.state.diasMeta = {};
    this.state.nextId = 1;
    this.state.nextHorarioId = 100;
    this.state.ui = { activeDayDatos: null, activeDayScore: null, activeDayCarrera: null };
    this.state.carrera = { pcRuntime: {}, pcResults: {} };
    this.notify();
  }
};
