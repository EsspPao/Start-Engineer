import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require=createRequire(import.meta.url);
const root=mkdtempSync(join(tmpdir(),'se-config-restart-'));
const profile=join(root,'start-engineer'); mkdirSync(profile);
writeFileSync(join(profile,'preferences.json'), JSON.stringify({firstRunImportCompleted:true,globalShortcutEnabled:false,closeBehavior:'quit'}));
writeFileSync(join(profile,'groups.json'), JSON.stringify([{id:'original',name:'Original group',icon:'grid',order:0,isSystem:false}]));
writeFileSync(join(profile,'backup-build.json'), JSON.stringify({build:'older-build'}));
for(const phase of ['prepare','verify']) {
 const result=spawnSync(require('electron'),['scripts/config-restart-fixture.mjs'],{env:{...process.env,SE_ACCEPTANCE_PROFILE:root,SE_ACCEPTANCE_PHASE:phase},encoding:'utf8',timeout:30000,windowsHide:true});
 if(result.status!==0){ console.error(result.stdout,result.stderr,result.error); process.exit(1); }
 if(result.stdout) process.stdout.write(result.stdout);
}
