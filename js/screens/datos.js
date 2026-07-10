import { store } from "../store.js";
import { openTimePad, timeField, fmtBuffer } from "../timepad.js";

export function initDatos(){
  const state = store.state;
  let openRowId = null;
  let dragSrcIdx = null;

  const dayTabsEl = document.getElementById("dayTabs");
  const listEl = document.getElementById("list");
  const horariosListEl = document.getElementById("horariosList");

  function activeDay(){ return state.ui.activeDayDatos; }
  function days(){ return state.days[activeDay()] || []; }
  function horarios(){ return state.dayHorarios[activeDay()] || []; }

  function renderTabs(){
    dayTabsEl.innerHTML = "";
    Object.keys(state.days).forEach(day => {
      const b = document.createElement("button");
      b.className = "daytab" + (day === activeDay() ? " active" : "");
      b.textContent = day;
      b.onclick = () => { state.ui.activeDayDatos = day; openRowId = null; renderAll(); };
      dayTabsEl.appendChild(b);
    });
    const addDay = document.createElement("button");
    addDay.className = "daytab add";
    addDay.textContent = "+ Etapa";
    addDay.onclick = () => {
      const n = Object.keys(state.days).length + 1;
      const name = "Etapa " + n;
      store.ensureDay(name);
      state.ui.activeDayDatos = name;
      renderAll();
    };
    dayTabsEl.appendChild(addDay);
  }

  function renderHorarios(){
    horariosListEl.innerHTML = "";
    horarios().forEach(h => {
      const row = document.createElement("div");
      row.className = "horarioItem";
      const nombreInp = document.createElement("input");
      nombreInp.className = "nombre"; nombreInp.type = "text"; nombreInp.value = h.nombre;
      nombreInp.oninput = () => { h.nombre = nombreInp.value; renderList(); };

      const pill = document.createElement("div");
      pill.className = "timepill";
      pill.style.flex = "1";
      pill.textContent = fmtBuffer(h.hora);
      pill.onclick = () => {
        openTimePad(h.nombre, h.hora, (newVal) => { h.hora = newVal; pill.textContent = fmtBuffer(newVal); store.notify(); });
      };

      const del = document.createElement("button");
      del.textContent = "✕";
      del.onclick = () => {
        state.dayHorarios[activeDay()] = horarios().filter(x => x.id !== h.id);
        renderHorarios(); renderList();
      };
      row.appendChild(nombreInp); row.appendChild(pill); row.appendChild(del);
      horariosListEl.appendChild(row);
    });
    store.notify();
  }

  function horarioNombre(refId){
    const h = horarios().find(x => x.id === refId);
    return h ? h.nombre : "(sin horario)";
  }
  function refOptions(){
    return horarios().map(h => [String(h.id), h.nombre]);
  }
  function pcSetLabel(item){
    const last = item.primerNumero + item.cantidad - 1;
    const rango = item.cantidad > 1 ? ("PC " + item.primerNumero + "–" + last) : ("PC " + item.primerNumero);
    return rango + " · " + item.cantidad + " prueba" + (item.cantidad > 1 ? "s" : "");
  }
  function chNombreById(id){
    const item = days().find(x => x.itemType === "CH" && x.id === id);
    return item ? item.nombre : "CH";
  }
  function chOptions(){
    return days().filter(x => x.itemType === "CH").map(x => [String(x.id), x.nombre]);
  }
  function origenPCLabel(item){
    if(item.origen === "libre") return "Largada libre";
    if(item.origen === "CH") return "Enlazado a " + chNombreById(item.chId);
    if(item.origen === "ref") return horarioNombre(item.refId) + " +" + fmtBuffer(item.offset || "000000");
    return "";
  }

  function renderList(){
    listEl.innerHTML = "";
    const items = days();
    items.forEach((c, idx) => {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.idx = idx;

      row.addEventListener("dragover", e => { e.preventDefault(); row.classList.add("dragover"); });
      row.addEventListener("dragleave", () => row.classList.remove("dragover"));
      row.addEventListener("drop", e => {
        e.preventDefault();
        row.classList.remove("dragover");
        if(dragSrcIdx === null || dragSrcIdx === idx) return;
        const moved = items.splice(dragSrcIdx, 1)[0];
        items.splice(idx, 0, moved);
        dragSrcIdx = null;
        renderList();
      });

      const top = document.createElement("div");
      top.className = "row-top";

      const handle = document.createElement("button");
      handle.className = "handle";
      handle.textContent = "⠿";
      handle.draggable = true;
      handle.addEventListener("dragstart", e => {
        dragSrcIdx = idx;
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      handle.addEventListener("dragend", () => row.classList.remove("dragging"));

      const badge = document.createElement("span");
      const name = document.createElement("span");
      name.className = "row-name";
      const time = document.createElement("span");
      time.className = "row-time";

      if(c.itemType === "CH"){
        badge.className = "badge CH"; badge.textContent = "CH";
        name.textContent = c.nombre;
        time.textContent = horarioNombre(c.refId) + " +" + fmtBuffer(c.offset || "000000");
      } else if(c.itemType === "CS"){
        badge.className = "badge CS"; badge.textContent = "CS";
        name.textContent = c.nombre;
        time.textContent = horarioNombre(c.refId) + " +" + fmtBuffer(c.offset || "000000");
      } else {
        badge.className = "badge PCSET"; badge.textContent = "PC";
        name.textContent = pcSetLabel(c);
        time.textContent = origenPCLabel(c);
      }

      const toggleOpen = () => { openRowId = (openRowId === c.id) ? null : c.id; renderList(); };
      name.onclick = toggleOpen;
      time.onclick = toggleOpen;

      top.appendChild(handle);
      top.appendChild(badge);
      top.appendChild(name);
      top.appendChild(time);
      row.appendChild(top);

      if(c.itemType === "PCSET" && c.origen === "CH"){
        const pill = document.createElement("span");
        pill.className = "chainpill";
        pill.textContent = "🔗 arranca con " + chNombreById(c.chId);
        row.appendChild(pill);
      }

      const form = document.createElement("div");
      form.className = "editform" + (openRowId === c.id ? " open" : "");
      buildForm(form, c, items, idx);
      row.appendChild(form);

      listEl.appendChild(row);
    });
    store.notify();
  }

  function field(labelText, type, value, onChange, disabled){
    const wrap = document.createElement("div");
    wrap.className = "field";
    const l = document.createElement("label"); l.textContent = labelText;
    const i = document.createElement("input");
    i.type = type; i.value = value || ""; if(disabled) i.disabled = true;
    i.oninput = () => onChange(i.value);
    i.onfocus = () => i.select();
    wrap.appendChild(l); wrap.appendChild(i);
    return wrap;
  }
  function selectField(labelText, options, value, onChange){
    const wrap = document.createElement("div");
    wrap.className = "field";
    const l = document.createElement("label"); l.textContent = labelText;
    const s = document.createElement("select");
    options.forEach(([val, txt]) => {
      const opt = document.createElement("option");
      opt.value = val; opt.textContent = txt;
      if(val === value) opt.selected = true;
      s.appendChild(opt);
    });
    s.onchange = () => onChange(s.value);
    wrap.appendChild(l); wrap.appendChild(s);
    return wrap;
  }
  function deleteBtn(items, idx){
    const del = document.createElement("button");
    del.className = "deleterow";
    del.textContent = "Eliminar";
    del.onclick = () => { items.splice(idx, 1); openRowId = null; renderList(); };
    return del;
  }

  function buildForm(form, c, items, idx){
    if(c.itemType === "CH" || c.itemType === "CS"){
      form.appendChild(field("Nombre", "text", c.nombre, v => { c.nombre = v; renderList(); }));
      const opts = refOptions();
      form.appendChild(selectField("Horario de referencia", opts, String(c.refId), v => { c.refId = parseInt(v, 10); renderList(); }));
      form.appendChild(timeField("Offset (hh:mm:ss)", c.offset, v => { c.offset = v; renderList(); }));
      form.appendChild(deleteBtn(items, idx));
    } else {
      const row2 = document.createElement("div");
      row2.className = "row2";
      row2.appendChild(field("Número del primero", "text", String(c.primerNumero), v => {
        c.primerNumero = parseInt(v, 10) || 1; renderList();
      }));
      row2.appendChild(field("Cantidad de PC", "text", String(c.cantidad), v => {
        const n = Math.max(1, parseInt(v, 10) || 1);
        const old = c.tiempos;
        c.tiempos = Array.from({length: n}, (_, i) => old[i] || "000130");
        c.cantidad = n;
        renderList();
      }));
      form.appendChild(row2);

      const origenOpts = [["libre", "Largada libre"], ["CH", "Enlazado a un CH"]].concat(
        refOptions().map(([val, txt]) => ["ref:" + val, txt])
      );
      const currentOrigenVal = c.origen === "ref" ? ("ref:" + c.refId) : c.origen;
      form.appendChild(selectField("Origen del primer PC", origenOpts, currentOrigenVal, v => {
        if(v.startsWith("ref:")){ c.origen = "ref"; c.refId = parseInt(v.slice(4), 10); }
        else {
          c.origen = v;
          if(v === "CH" && !c.chId){
            const opts = chOptions();
            if(opts.length) c.chId = parseInt(opts[0][0], 10);
          }
        }
        renderList();
      }));

      if(c.origen === "CH"){
        const opciones = chOptions();
        if(opciones.length === 0){
          const aviso = document.createElement("div");
          aviso.style.cssText = "font-size:12px;color:var(--muted);padding:4px 0;";
          aviso.textContent = "Todavía no hay ningún CH cargado en esta etapa.";
          form.appendChild(aviso);
        } else {
          form.appendChild(selectField("¿Cuál CH?", opciones, String(c.chId), v => { c.chId = parseInt(v, 10); renderList(); }));
        }
      }
      if(c.origen === "ref"){
        form.appendChild(timeField("Offset desde ese horario", c.offset, v => { c.offset = v; }));
      }

      const grid = document.createElement("div");
      grid.className = "pcgrid";
      for(let i = 0; i < c.cantidad; i++){
        const wrap = document.createElement("div");
        wrap.className = "pcitem";
        const lbl = document.createElement("span");
        lbl.className = "pclabel";
        lbl.textContent = "PC " + (c.primerNumero + i);
        const pill = document.createElement("div");
        pill.className = "timepill";
        pill.textContent = fmtBuffer(c.tiempos[i] || "000000");
        pill.onclick = ((index) => () => {
          openTimePad("PC " + (c.primerNumero + index), c.tiempos[index], (newVal) => {
            c.tiempos[index] = newVal;
            pill.textContent = fmtBuffer(newVal);
            store.notify();
          });
        })(i);
        wrap.appendChild(lbl); wrap.appendChild(pill);
        grid.appendChild(wrap);
      }
      form.appendChild(grid);
      form.appendChild(deleteBtn(items, idx));
    }
  }

  document.getElementById("addHorarioBtn").onclick = () => {
    store.ensureDay(activeDay());
    state.dayHorarios[activeDay()].push({id: state.nextHorarioId++, nombre: "Nuevo horario", hora: "000000"});
    renderHorarios();
  };

  document.getElementById("addCH").onclick = () => {
    const items = days();
    const firstRef = horarios()[0];
    const n = {id: state.nextId++, itemType: "CH", nombre: "Nuevo CH", refId: firstRef ? firstRef.id : null, offset: "000000"};
    items.push(n); openRowId = n.id; renderList();
  };
  document.getElementById("addCS").onclick = () => {
    const items = days();
    const firstRef = horarios()[0];
    const n = {id: state.nextId++, itemType: "CS", nombre: "Nuevo CS", refId: firstRef ? firstRef.id : null, offset: "000000"};
    items.push(n); openRowId = n.id; renderList();
  };
  document.getElementById("addPCSET").onclick = () => {
    const items = days();
    const n = {id: state.nextId++, itemType: "PCSET", primerNumero: 1, cantidad: 1, origen: "libre", refId: null, chId: null, tiempos: ["000130"]};
    items.push(n); openRowId = n.id; renderList();
  };

  function renderAll(){ renderTabs(); renderHorarios(); renderList(); store.notify(); }

  return {
    show(){ renderAll(); },
    hide(){}
  };
}
