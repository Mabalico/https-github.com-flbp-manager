import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const arg=(name)=>args.includes(name)?args[args.indexOf(name)+1]:null;
const databaseUrl=arg('--database-url');
const modulePath=arg('--pglite');
assert.ok(!args.includes('--legacy'),'This regression requires the complete ONLINE schema, including local-primary normalizers');
assert.ok(!!databaseUrl!==!!modulePath,'Choose --database-url <disposable loopback URL> or --pglite <absolute module path>');
const suiteFile=path.join(root,'supabase/tests/fanta_archive_order.sql');
// Supabase keeps executable statements in migration history; two existing
// migrations deliberately replay that history. Split only at SQL-level ';'.
const splitSql=(sql)=>{
  const statements=[];
  let start=0, quote=null, dollar=null, lineComment=false, blockDepth=0;
  for(let i=0;i<sql.length;i++){
    if(lineComment){ if(sql[i]==='\n') lineComment=false; continue; }
    if(blockDepth){
      if(sql.startsWith('/*',i)){blockDepth++;i++;}
      else if(sql.startsWith('*/',i)){blockDepth--;i++;}
      continue;
    }
    if(dollar){if(sql.startsWith(dollar,i)){i+=dollar.length-1;dollar=null;}continue;}
    if(quote){if(sql[i]===quote){if(sql[i+1]===quote)i++;else quote=null;}continue;}
    if(sql.startsWith('--',i)){lineComment=true;i++;continue;}
    if(sql.startsWith('/*',i)){blockDepth=1;i++;continue;}
    if(sql[i]==="'"||sql[i]==='"'){quote=sql[i];continue;}
    const tag=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
    if(tag){dollar=tag;i+=tag.length-1;continue;}
    if(sql[i]===';'){statements.push(sql.slice(start,i+1).trim());start=i+1;}
  }
  const tail=sql.slice(start).trim();
  if(tail.replace(/--[^\n]*(?:\n|$)/g,'').trim()) statements.push(tail);
  return statements.filter(Boolean);
};
if(databaseUrl){
  const url=new URL(databaseUrl);
  assert.ok(['postgres:','postgresql:'].includes(url.protocol));
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only disposable loopback PostgreSQL is allowed');
  assert.equal(url.search,''); assert.equal(url.hash,'');
  const result=spawnSync('psql',['-X','--set=ON_ERROR_STOP=1','--dbname',databaseUrl,'--file',suiteFile],{encoding:'utf8',windowsHide:true});
  if(result.error) throw result.error;
  process.stdout.write(result.stdout||''); process.stderr.write(result.stderr||''); process.exitCode=result.status??1;
}else{
  assert.ok(path.isAbsolute(modulePath));
  const {PGlite}=await import(pathToFileURL(modulePath).href);
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key, statements text[], name text);
      create schema auth; grant usage on schema auth, public to anon, authenticated, service_role;
      create table auth.users(id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz,
        raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
      create table auth.identities(id uuid primary key,user_id uuid references auth.users(id),provider text,provider_id text,identity_data jsonb,
        created_at timestamptz default now(),updated_at timestamptz default now(),last_sign_in_at timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
      create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    `);
    const migrationDir=path.join(root,'supabase/migrations');
    const files=(await fs.readdir(migrationDir)).filter(name=>name.endsWith('.sql')).sort();
    for(const name of files){
      try{
        const sql=await fs.readFile(path.join(migrationDir,name),'utf8');
        await db.exec(sql);
        await db.query('insert into supabase_migrations.schema_migrations(version,statements,name) values ($1,$2,$3)',
          [name.split('_')[0],splitSql(sql),name]);
      }
      catch(error){throw new Error(`${name}: ${error.message}`,{cause:error});}
    }
    console.log(`Applied ${files.length} ONLINE migrations (complete sequence) to in-memory PostgreSQL.`);
    const results=await db.exec(await fs.readFile(suiteFile,'utf8'));
    for(const row of results.flatMap(result=>result.rows||[])){
      for(const value of Object.values(row)) if(typeof value==='string'&&value.startsWith('PASS:')) console.log(value);
    }
    console.log('Fanta archive order integration suite passed; all fixtures rolled back.');
  }catch(error){
    console.error(`Fanta archive order test failed: ${error.message}`);
    if(error.where||error.cause?.where) console.error(error.where||error.cause.where);
    process.exitCode=1;
  }finally{await db.close();}
}
