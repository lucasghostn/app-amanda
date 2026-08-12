const dayNames=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
export function localDate(value=new Date()){if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d)}const date=new Date(value);date.setHours(0,0,0,0);return date}
export const dateKey=value=>{const d=localDate(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const addDays=(value,days)=>{const d=localDate(value);d.setDate(d.getDate()+days);return d};
export const startOfWeek=value=>{const d=localDate(value);d.setDate(d.getDate()-((d.getDay()+6)%7));return d};
export const endOfWeek=value=>addDays(startOfWeek(value),6);
export function isoWeek(value){const d=localDate(value);d.setDate(d.getDate()+3-((d.getDay()+6)%7));const year=d.getFullYear();const first=new Date(year,0,4);return {year,week:1+Math.round((d-startOfWeek(first))/604800000)}}
export function weekStart(year,week){const jan4=new Date(year,0,4);return addDays(startOfWeek(jan4),(week-1)*7)}
export function weeksInYear(year){return isoWeek(new Date(year,11,28)).week}
export const formatDate=value=>new Intl.DateTimeFormat('pt-BR').format(localDate(value));
export const formatRange=start=>`${formatDate(start)} — ${formatDate(endOfWeek(start))}`;
export const dayName=value=>dayNames[localDate(value).getDay()];
