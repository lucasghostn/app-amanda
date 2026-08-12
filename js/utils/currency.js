const formatter=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
export const formatCurrency=cents=>formatter.format((Number(cents)||0)/100);
export function parseCurrency(value){const cleaned=String(value??'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.');const n=Number(cleaned);return Number.isFinite(n)&&n>0?Math.round(n*100):null}
export const addMoney=(...values)=>values.reduce((sum,value)=>sum+(Number(value)||0),0);
export const subtractMoney=(income,expense)=>addMoney(income)-addMoney(expense);
