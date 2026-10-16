import test from 'node:test'
import assert from 'node:assert/strict'
import {reflectionRows,reflectionPayload,validateReflections,overallReflectionStatus,savedReflections} from './contributionReflections.js'
const plan={revision:3,contributions:[{id:'a',title:'Reduce rework'},{id:'b',title:'Improve handoffs'}]}
const filled=()=>reflectionRows(plan).map((r,i)=>({...r,reflection:`Reflection ${i+1}`,metric_now:i?'Not measured':'0 revisions, this week',track_status:'on_track',blocker:'',next_commitment:'Test checklist by Friday'}))
test('one block per saved contribution; status is not guessed',()=>{assert.equal(reflectionRows(plan).length,2);assert.equal(reflectionRows(plan)[0].track_status,'');assert.equal(reflectionRows({contributions:[plan.contributions[0]]}).length,1)})
test('two distinct reflections and revision in payload',()=>{const p=reflectionPayload(filled(),plan);assert.equal(p.reflection_plan_revision,3);assert.equal(p.contribution_updates[1].reflection,'Reflection 2')})
test('map by ID even after reorder',()=>{const p=reflectionPayload(filled().reverse(),plan);assert.equal(p.contribution_updates[0].reflection,'Reflection 1')})
test('one-contribution plan is supported',()=>{assert.equal(validateReflections([filled()[0]],{...plan,contributions:[plan.contributions[0]]}),'')})
test('empty reflection for second contribution blocks submit',()=>{const rows=filled();rows[1].reflection=' ';assert.match(validateReflections(rows,plan),/Improve handoffs/)})
test('missing, duplicate, foreign and idless contributions rejected',()=>{assert.ok(validateReflections([filled()[0]],plan));assert.ok(validateReflections([filled()[0],filled()[0]],plan));assert.ok(validateReflections([{...filled()[0],contribution_id:'z'},filled()[1]],plan));assert.ok(validateReflections(filled(),{...plan,contributions:[{title:'No ID'},plan.contributions[1]]}))})
test('status, evidence, and next commitment required separately',()=>{for(const k of ['track_status','metric_now','next_commitment']){const rows=filled();rows[1][k]='';assert.ok(validateReflections(rows,plan))}})
test('unknown, no progress and empty optional blocker accepted',()=>{const rows=filled();rows[0].reflection='No progress: awaiting assets';rows[0].metric_now='Not measured';assert.equal(validateReflections(rows,plan),'')})
test('worst status surfaces risk, not an average',()=>{const rows=filled();rows[0].track_status='at_risk';assert.equal(overallReflectionStatus(rows),'at_risk');rows[1].track_status='off_track';assert.equal(overallReflectionStatus(rows),'off_track')})
test('older check-ins are not fabricated into two reflections',()=>{assert.deepEqual(savedReflections({progress_note:'Earlier overall update'}),[])})
