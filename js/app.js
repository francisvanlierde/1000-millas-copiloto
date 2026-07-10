import { initDatos } from "./screens/datos.js";
import { initCarrera } from "./screens/carrera.js";
import { initScore } from "./screens/score.js";
import { initAjustes } from "./screens/ajustes.js";

const tabs = [
  {id:"datos",   icon:"📋", label:"Datos"},
  {id:"carrera", icon:"⏱️", label:"Carrera"},
  {id:"score",   icon:"🏁", label:"Score"},
  {id:"ajustes", icon:"⚙️", label:"Ajustes"}
];

const screens = {
  datos: initDatos(),
  carrera: initCarrera(),
  score: initScore(),
  ajustes: initAjustes()
};

let active = "carrera";
const tabbarEl = document.getElementById("tabbar");

function renderTabbar(){
  tabbarEl.innerHTML = "";
  tabs.forEach(t => {
    const b = document.createElement("button");
    b.className = "tab" + (t.id === active ? " active" : "");
    b.innerHTML = '<span class="ticon">'+t.icon+'</span><span class="tlabel">'+t.label+'</span>';
    b.onclick = () => setActive(t.id);
    tabbarEl.appendChild(b);
  });
}

function setActive(id){
  if(id === active) return;
  screens[active].hide();
  active = id;
  tabs.forEach(t => {
    document.getElementById("screen-" + t.id).classList.toggle("active", t.id === active);
  });
  screens[active].show();
  renderTabbar();
}

tabs.forEach(t => {
  document.getElementById("screen-" + t.id).classList.toggle("active", t.id === active);
});
screens[active].show();
renderTabbar();

if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  });
}
