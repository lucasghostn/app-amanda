import * as db from './database.js';
export const transactions={all:()=>db.getAll('transactions'),save:value=>db.put('transactions',value),delete:id=>db.remove('transactions',id)};
export const categories={all:()=>db.getAll('categories'),save:value=>db.put('categories',value),delete:id=>db.remove('categories',id)};
export const settings={all:()=>db.getAll('settings'),save:value=>db.put('settings',value)};
export const goals={all:()=>db.getAll('goals'),save:value=>db.put('goals',value),delete:id=>db.remove('goals',id)};
export const resetAll=async()=>Promise.all(['transactions','categories','settings','goals'].map(db.clear));
