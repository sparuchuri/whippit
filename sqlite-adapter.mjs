import {DatabaseSync} from 'node:sqlite';
export function sqliteD1(path=':memory:'){
 const db=new DatabaseSync(path);
 return {db,prepare(sql){return {bind(...args){return {sql,args,async all(){return {results:db.prepare(sql).all(...args)}}}}}},async batch(statements){
   db.exec('BEGIN IMMEDIATE');try{const result=statements.map(({sql,args})=>{
     const query=db.prepare(sql);
     if(/^\s*SELECT/i.test(sql))return {results:query.all(...args),meta:{changes:0}};
     const changed=query.run(...args);return {results:[],meta:{changes:Number(changed.changes)}};
   });db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
 }};
}
