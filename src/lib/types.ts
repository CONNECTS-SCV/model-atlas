export type Kind = 'model'|'tool'|'paper'|'dataset'|'review'|'library'|'benchmark';
export type Entry = {
 key:string; name:string; aliases:string[]; kind:Kind; title:string; paperUrls:string[]; codeUrls:string[];
 targets:string[]; tasks:string[]; purposes:string[]; conditions:string[]; algorithms:string[]; accessibility:string[];
 description_ko:string; first_public_date:string|null; publication_date:string|null;
 weights_url:string|null; demo_url:string|null; family:string|null; version:string|null;
 inputs:string[]; outputs:string[]; organization:string|null; runtime_requirements:string|null;
 code_license:string|null; weights_license:string|null; data_license:string|null;
 experimental_evidence:unknown; metadata:Record<string,unknown>; location:string; raw:unknown; needsReview:boolean;
};
export type TreeFile = {path:string;sha:string;type:string};
export type Model = Entry & {id:string; updated_at:string; first_seen:string; verified:boolean; sources_count:number; repository_urls:string[]; aliases:string[]; overrides:Record<string,unknown>};
