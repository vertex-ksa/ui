import { describe, it, expect } from 'vitest';
import { exactAmount, readPreview, visiblePreview } from '../../src/pages/reports/receivables/preview';
const fixture = () => ({provenance:{Abc123:{invoice_number:"INV-001"}},preview_only:true,complete_within_scope:true,balance_basis:'current_native_balance_at_read_time',generated_at:'2026-10-01T00:00:00Z',as_of_date:'2026-10-01',currency_precisions:{USD:2},open_receivables_minor_by_currency:{USD:'9007199254740993'},rows:[{invoice_id:'Abc123',source_version:1,currency:'USD',balance_minor:'9007199254740993',overdue_days:12,state:'hold_context_unverified',dispatch_allowed:false}]});
describe('exact native receivables amounts',()=>{
 it('preserves values above JavaScript safe integer',()=>expect(exactAmount('9007199254740993',2,'en')).toBe('90,071,992,547,409.93'));
 it('retains six decimal places',()=>expect(exactAmount('1',6,'en')).toBe('0.000001'));
 it('handles zero precision',()=>expect(exactAmount('1234',0,'en')).toBe('1,234'));
 it('localizes digits without rounding',()=>expect(exactAmount('12345',2,'ar')).toBe('١٢٣٫٤٥'));
 it.each(['1.2','-1','01','1e3'])('rejects noncanonical minor units %s',v=>expect(()=>exactAmount(v,2,'en')).toThrow());
 it('rejects unavailable native precision',()=>expect(()=>exactAmount('1',undefined as unknown as number,'en')).toThrow());
});
describe('preview authority and completeness',()=>{
 it('accepts complete read-only current balances',()=>expect(readPreview(fixture()).rows[0].state).toBe('hold_context_unverified'));
 it('rejects dispatch authority',()=>{const p=fixture();p.rows[0].dispatch_allowed=true;expect(()=>readPreview(p)).toThrow();});
 it('rejects incomplete scope',()=>{const p=fixture();p.complete_within_scope=false;expect(()=>readPreview(p)).toThrow();});
 it('rejects truncated totals',()=>{const p=fixture();p.open_receivables_minor_by_currency.USD='1';expect(()=>readPreview(p)).toThrow();});
 it('rejects malformed navigation identity',()=>{const p=fixture();p.rows[0].invoice_id='../other';expect(()=>readPreview(p)).toThrow();});
 it('rejects duplicate invoices',()=>{const p=fixture();p.rows.push(p.rows[0]);expect(()=>readPreview(p)).toThrow();});
 it('rejects unknown decision states',()=>{const p=fixture();p.rows[0].state='eligible_to_send';expect(()=>readPreview(p)).toThrow();});
 it('rejects noncanonical currency',()=>{const p=fixture();p.rows[0].currency='usd';expect(()=>readPreview(p)).toThrow();});
 it('rejects invalid read timestamp',()=>{const p=fixture();p.generated_at='bad';expect(()=>readPreview(p)).toThrow();});
 it('rejects historical balance claims',()=>{const p=fixture();p.balance_basis='historical';expect(()=>readPreview(p)).toThrow();});
});

describe('synchronous preview context isolation',()=>{
 const data=readPreview(fixture());
 const snapshot={data,companyId:'company-a',date:'2026-10-01',days:'1'};
 it('shows only the matching current company/date/threshold',()=>expect(visiblePreview(snapshot,snapshot)).toBe(data));
 it('hides results while current company is unavailable',()=>expect(visiblePreview({...snapshot,companyId:undefined},{...snapshot,companyId:undefined})).toBeUndefined());
 it('hides prior company results before effect cleanup',()=>expect(visiblePreview(snapshot,{...snapshot,companyId:'company-b'})).toBeUndefined());
 it('hides prior date results',()=>expect(visiblePreview(snapshot,{...snapshot,date:'2026-10-02'})).toBeUndefined());
 it('hides prior threshold results',()=>expect(visiblePreview(snapshot,{...snapshot,days:'30'})).toBeUndefined());
});
