import {formatCurrency,parseCurrency,addMoney,subtractMoney} from '../js/utils/currency.js';
import {isoWeek,weekStart,dateKey} from '../js/utils/dates.js';
import {summary} from '../js/services/financeService.js';
const out=document.querySelector('#results'),results=[];function test(name,fn){try{fn();results.push(`✓ ${name}`)}catch(e){results.push(`✗ ${name}: ${e.message}`)}}function equal(actual,expected){if(actual!==expected)throw new Error(`esperado ${expected}, recebeu ${actual}`)}
test('dinheiro em centavos',()=>{equal(addMoney(1050,100),1150);equal(subtractMoney(150000,5000),145000);equal(formatCurrency(1050),'R$ 10,50');equal(parseCurrency('R$ 1.250,50'),125050)});
test('semanas ISO em mudança de ano',()=>{equal(isoWeek('2021-01-01').week,53);equal(isoWeek('2021-01-04').week,1);equal(dateKey(weekStart(2026,1)),'2025-12-29');equal(isoWeek(weekStart(2026,1)).year,2026)});
test('resumo financeiro',()=>{const s=summary([{type:'income',amount:150000,date:'2026-08-10'},{type:'expense',amount:5000,date:'2026-08-10'}]);equal(s.balance,145000);equal(s.percent,3.3)});
out.textContent=results.join('\n');if(results.some(x=>x.startsWith('✗')))throw new Error('Há testes com falha.');
