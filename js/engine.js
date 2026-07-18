// Motor de cronómetro — funciones puras, sin DOM.
// Calcula en base al roadbook (state.days / state.dayHorarios) y a los
// resultados/arranques ya registrados (state.carrera) qué corresponde
// mostrar en Carrera en el instante `now`.

export function hhmmssToMs(str){
  const s = (str || "000000").replace(/:/g, "").padStart(6, "0").slice(-6);
  const h = parseInt(s.slice(0,2), 10) || 0;
  const m = parseInt(s.slice(2,4), 10) || 0;
  const sec = parseInt(s.slice(4,6), 10) || 0;
  return ((h*3600) + (m*60) + sec) * 1000;
}

export function todayMidnightMs(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.getTime();
}

export function instantFromHora(horaStr, offsetStr){
  return todayMidnightMs() + hhmmssToMs(horaStr) + (offsetStr ? hhmmssToMs(offsetStr) : 0);
}

export function nowOficial(state){
  return Date.now() + (state.ajustes.clockOffsetMs || 0);
}

// Aplana el roadbook de un día en una cola ordenada de controles/PCs.
export function buildQueue(day, state){
  const items = state.days[day] || [];
  const horarios = state.dayHorarios[day] || [];
  const chById = {};
  items.forEach(it => { if(it.itemType === "CH") chById[it.id] = it; });

  function horarioById(id){ return horarios.find(h => h.id === id) || null; }
  function scheduledForRef(refId, offset){
    const h = horarioById(refId);
    return h ? instantFromHora(h.hora, offset) : null;
  }
  function scheduledForCH(chItem){
    return chItem ? scheduledForRef(chItem.refId, chItem.offset) : null;
  }

  const queue = [];
  items.forEach(it => {
    if(it.itemType === "CH" || it.itemType === "CS"){
      queue.push({
        kind: it.itemType,
        id: it.id,
        nombre: it.nombre,
        scheduled: scheduledForRef(it.refId, it.offset)
      });
    } else if(it.itemType === "PCSET"){
      for(let i = 0; i < it.cantidad; i++){
        const isFirst = i === 0;
        const entry = {
          kind: "PC",
          key: it.id + ":" + i,
          setId: it.id,
          pcIndex: i,
          pcNumber: it.primerNumero + i,
          duracionMs: hhmmssToMs(it.tiempos[i] || "000000"),
          isFirstInSet: isFirst
        };
        if(isFirst){
          entry.origen = it.origen;
          if(it.origen === "ref"){
            entry.scheduledPassInstant = scheduledForRef(it.refId, it.offset);
          } else if(it.origen === "CH"){
            entry.scheduledPassInstant = scheduledForCH(chById[it.chId]);
          }
        }
        queue.push(entry);
      }
    }
  });
  return queue;
}

// Devuelve el estado del control/PC "actual" (el primer no resuelto de la cola).
export function getStatus(day, state, now){
  const queue = buildQueue(day, state);
  const results = state.carrera.pcResults[day] || [];
  let pcSeen = 0;
  let lastPcEndInstant = null;

  for(let i = 0; i < queue.length; i++){
    const entry = queue[i];

    if(entry.kind === "CH" || entry.kind === "CS"){
      if(entry.scheduled == null || now >= entry.scheduled) continue; // pasado solo, sin acción
      return {
        kind: entry.kind,
        label: entry.nombre,
        scheduled: entry.scheduled,
        remainingMs: entry.scheduled - now,
        queueIndex: i
      };
    }

    // entry.kind === "PC"
    if(pcSeen < results.length){
      lastPcEndInstant = results[pcSeen].endInstant;
      pcSeen++;
      continue;
    }

    let startInstant = null;
    let needsLargar = false;
    let needsConfirmPass = false;
    let scheduledPassInstant = null;

    if(entry.isFirstInSet){
      const rt = state.carrera.pcRuntime[entry.key];
      startInstant = rt ? rt.startInstant : null;
      if(entry.origen === "libre"){
        needsLargar = startInstant == null;
      } else {
        scheduledPassInstant = entry.scheduledPassInstant;
        needsConfirmPass = startInstant == null;
      }
    } else {
      startInstant = lastPcEndInstant; // encadenado: arranca solo al tocar el anterior
    }

    if(startInstant == null){
      return {
        kind: "PC",
        pcNumber: entry.pcNumber,
        key: entry.key,
        origen: entry.origen,
        needsLargar,
        needsConfirmPass,
        scheduledPassInstant,
        remainingMs: scheduledPassInstant != null ? (scheduledPassInstant - now) : null,
        duracionMs: entry.duracionMs,
        queueIndex: i
      };
    }

    const remainingMs = entry.duracionMs - (now - startInstant);
    return {
      kind: "PC",
      pcNumber: entry.pcNumber,
      key: entry.key,
      running: true,
      overdue: remainingMs < 0,
      startInstant,
      remainingMs,
      duracionMs: entry.duracionMs,
      queueIndex: i
    };
  }

  return { kind: "DONE" };
}

// Fija el instante de arranque de un PC (sirve tanto para "Largar" como
// para "confirmar el paso" por un CH/ref enlazado — misma acción física).
export function iniciarPC(state, key, now){
  state.carrera.pcRuntime[key] = { startInstant: now };
}

// Cierra el PC en curso: calcula el delta y lo agrega a pcResults[day].
export function finalizarPC(state, day, status, now){
  const deltaSeg = (status.duracionMs - (now - status.startInstant)) / 1000;
  if(!state.carrera.pcResults[day]) state.carrera.pcResults[day] = [];
  state.carrera.pcResults[day].push({
    pc: "PC " + status.pcNumber,
    delta: deltaSeg,
    key: status.key,
    startInstant: status.startInstant,
    endInstant: now
  });
  delete state.carrera.pcRuntime[status.key];
}

// Deshace el último toque: si hay un resultado registrado lo saca de la lista;
// si no, y hay un PC largado/confirmado sin terminar, cancela ese arranque.
export function deshacerUltimoToque(state, day){
  const results = state.carrera.pcResults[day];
  if(results && results.length){
    results.pop();
    return true;
  }
  const status = getStatus(day, state, nowOficial(state));
  if(status.kind === "PC" && status.key && state.carrera.pcRuntime[status.key]){
    delete state.carrera.pcRuntime[status.key];
    return true;
  }
  return false;
}
