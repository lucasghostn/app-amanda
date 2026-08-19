import {formatCurrency} from '../utils/currency.js';
const download=(name,type,text)=>{const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0)};
export const exportJson=data=>download('organiza-financas-backup.json','application/json',JSON.stringify(data,null,2));
export const exportCsv=items=>download('organiza-financas-lancamentos.csv','text/csv;charset=utf-8','Tipo;Categoria;Data;Descrição;Valor\n'+items.map(x=>[x.type==='income'?'Ganho':'Gasto',x.categoryName,x.date,x.description,formatCurrency(x.amount)].map(v=>`"${String(v||'').replaceAll('"','""')}"`).join(';')).join('\n'));
