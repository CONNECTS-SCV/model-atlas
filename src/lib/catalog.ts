import { query } from './db';
const projection=`m.*, EXISTS(SELECT 1 FROM claims dc WHERE dc.model_id=m.id AND dc.field='description_ko' AND dc.origin='official') description_verified, (SELECT count(*)::int FROM model_relations rel WHERE rel.successor_id=m.id) predecessor_count, EXISTS(SELECT 1 FROM reviews rev WHERE rev.model_id=m.id AND rev.status='pending' AND rev.reason IN ('conflicting_license','multiple_code_licenses')) license_review, (SELECT max(r.checked_at) FROM code_repositories r JOIN model_repositories mr ON mr.repository_id=r.id WHERE mr.model_id=m.id AND mr.active) code_checked_at, (SELECT string_agg(DISTINCT ej.status,',') FROM enrichment_jobs ej JOIN model_repositories mr ON mr.repository_id=ej.repository_id WHERE mr.model_id=m.id AND mr.active) code_check_status, (SELECT count(DISTINCT se.source_id)::int FROM source_entries se WHERE se.model_id=m.id AND se.status='active') sources_count, ARRAY(SELECT r.url FROM code_repositories r JOIN model_repositories mr ON mr.repository_id=r.id WHERE mr.model_id=m.id AND mr.active=true) repository_urls, EXISTS(SELECT 1 FROM claims c WHERE c.model_id=m.id AND c.origin='official') verified`;
export async function catalog(params:URLSearchParams) {
 const values:unknown[]=[];const where:string[]=[];
 if(params.get('lifecycle')==='archived')where.push("m.lifecycle<>'active'");else if(params.get('lifecycle')!=='all')where.push("m.lifecycle='active'");
 const add=(v:unknown)=>{values.push(v);return `$${values.length}`;};
 const q=(params.get('q')||'').slice(0,200);
 if(q)where.push(`m.search_text ILIKE ${add('%'+q.replace(/[\\%_]/g,'\\$&')+'%')}`);
 for(const field of ['targets','tasks','algorithms','accessibility','purposes','conditions']){const v=params.getAll(field).filter(Boolean);if(v.length)where.push(`m.${field} && ${add(v)}::text[]`);}
 const kind=params.get('kind');if(kind==='tool')where.push("(m.kind IN ('tool','library') OR m.metadata->'roles' ? 'tool')");else if(kind&&kind!=='all')where.push(`m.kind=${add(kind)}`);
 const source=params.get('source');if(source)where.push(`EXISTS(SELECT 1 FROM source_entries se WHERE se.model_id=m.id AND se.source_id=${add(source)} AND se.status='active')`);
 const ids=params.get('ids');if(ids){const list=ids.split(',').filter(x=>/^[0-9a-f-]{36}$/i.test(x)).slice(0,1000);where.push(`m.id=ANY(${add(list)}::uuid[])`);}
 if(params.get('verified')==='true')where.push("EXISTS(SELECT 1 FROM claims c WHERE c.model_id=m.id AND c.origin='official')");
 if(params.get('license')==='verified')where.push('m.code_license IS NOT NULL');
 const condition=where.length?'WHERE '+where.join(' AND '):'';
 const count=(await query(`SELECT count(*)::int total FROM admitted_models m ${condition}`,values)).rows[0].total;
 const sorts:Record<string,string>={name:'m.name ASC',newest:'m.first_public_date DESC NULLS LAST, m.name',updated:'m.updated_at DESC, m.name',discovered:'m.first_seen DESC, m.name'};
 const integer=(v:string|null,fallback:number,max:number)=>{const n=Number(v);return Number.isFinite(n)&&n>=1?Math.min(max,Math.floor(n)):fallback;};const page=integer(params.get('page'),1,100000);const size=integer(params.get('limit'),30,100);
 const {rows}=await query(`SELECT ${projection} FROM admitted_models m ${condition} ORDER BY ${sorts[params.get('sort')||'']||sorts.name},m.id LIMIT ${add(size)} OFFSET ${add((page-1)*size)}`,values);
 return {rows,total:count,page,pageSize:size};
}
export async function overview() {
 const [counts,sources,events,facets,worker,coverage]=await Promise.all([
 query("SELECT count(*) FILTER(WHERE lifecycle='active')::int total,count(*) FILTER(WHERE kind='model' AND lifecycle='active')::int models,count(*) FILTER(WHERE kind='paper' AND lifecycle='active')::int papers,count(*) FILTER(WHERE lifecycle='active' AND (kind IN ('tool','library') OR metadata->'roles' ? 'tool'))::int tools,count(*) FILTER(WHERE code_license IS NOT NULL)::int verified_licenses,count(*) FILTER(WHERE lifecycle<>'active')::int archived FROM admitted_models"),
 query('SELECT * FROM sources ORDER BY id'),
 query('SELECT e.*,m.name FROM events e LEFT JOIN admitted_models m ON m.id=e.model_id WHERE e.model_id IS NULL OR m.id IS NOT NULL ORDER BY e.id DESC LIMIT 100'),
 query(`SELECT 'targets' axis,unnest(targets) value,count(*)::int count FROM admitted_models GROUP BY value UNION ALL SELECT 'tasks',unnest(tasks),count(*)::int FROM admitted_models GROUP BY unnest(tasks) UNION ALL SELECT 'algorithms',unnest(algorithms),count(*)::int FROM admitted_models GROUP BY unnest(algorithms) UNION ALL SELECT 'accessibility',unnest(accessibility),count(*)::int FROM admitted_models GROUP BY unnest(accessibility)`),
 query("SELECT *,(heartbeat_at>now()-interval '45 seconds' AND phase<>'stopped') online FROM worker_state WHERE id='scheduler'"),
 query("SELECT (SELECT count(*)::int FROM code_repositories) repositories,(SELECT count(*)::int FROM code_repositories WHERE checked_at IS NOT NULL) checked,(SELECT count(*)::int FROM code_repositories WHERE license IS NOT NULL) licenses,(SELECT count(*)::int FROM enrichment_jobs WHERE status='failed') failures,(SELECT count(*)::int FROM admitted_models m WHERE kind='model' AND NOT EXISTS(SELECT 1 FROM model_repositories mr WHERE mr.model_id=m.id AND mr.active)) missing_code_links")
 ]);
 return {counts:counts.rows[0],sources:sources.rows,events:events.rows,facets:facets.rows,worker:worker.rows[0]||null,coverage:coverage.rows[0]};
}
export async function modelDetail(id:string) {
 if(!/^[0-9a-f-]{36}$/i.test(id))return null;
 const model=(await query(`SELECT ${projection} FROM admitted_models m WHERE m.id=$1`,[id])).rows[0];if(!model)return null;
 const [papers,repositories,sources,claims,events,related,predecessors,successors]=await Promise.all([
 query('SELECT p.* FROM papers p JOIN model_papers mp ON mp.paper_id=p.id WHERE mp.model_id=$1',[id]),
 query('SELECT r.*,mr.active,mr.link_origin,ej.status check_status FROM code_repositories r JOIN model_repositories mr ON mr.repository_id=r.id LEFT JOIN enrichment_jobs ej ON ej.repository_id=r.id WHERE mr.model_id=$1',[id]),
 query('SELECT se.*,s.repo,s.label FROM source_entries se JOIN sources s ON s.id=se.source_id WHERE se.model_id=$1 ORDER BY se.status,se.last_seen DESC',[id]),
 query('SELECT * FROM claims WHERE model_id=$1 ORDER BY checked_at DESC LIMIT 150',[id]),
 query('SELECT * FROM events WHERE model_id=$1 ORDER BY id DESC LIMIT 100',[id]),
 query(`SELECT DISTINCT m.id,m.name,m.kind FROM admitted_models m LEFT JOIN model_papers mp ON mp.model_id=m.id WHERE m.id<>$1 AND ((m.family IS NOT NULL AND m.family=$2) OR mp.paper_id IN (SELECT paper_id FROM model_papers WHERE model_id=$1)) LIMIT 20`,[id,model.family]),
 query('SELECT rel.*,m.name,m.kind,m.lifecycle,(a.id IS NOT NULL) available FROM model_relations rel JOIN models m ON m.id=rel.predecessor_id LEFT JOIN admitted_models a ON a.id=m.id WHERE rel.successor_id=$1 ORDER BY rel.checked_at DESC',[id]),
 query('SELECT rel.*,m.name,m.kind,m.lifecycle FROM model_relations rel JOIN admitted_models m ON m.id=rel.successor_id WHERE rel.predecessor_id=$1 ORDER BY rel.checked_at DESC',[id])
 ]);
 return {...model,papers:papers.rows,repositories:repositories.rows,sources:sources.rows,claims:claims.rows,events:events.rows,related:related.rows,predecessors:predecessors.rows,successors:successors.rows};
}
