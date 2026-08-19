import {startOfWeek} from '../utils/dates.js';
export const state={week:startOfWeek(new Date()),transactions:[],categories:[],settings:{theme:'system'},goals:[],filters:{type:'all',search:'',category:''}};
const listeners=new Set();export const subscribe=fn=>(listeners.add(fn),()=>listeners.delete(fn));export function update(next){Object.assign(state,next);listeners.forEach(fn=>fn(state))}
