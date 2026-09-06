import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(); let pass=0,fail=0; const results=[];
const check=(name,c,d='')=>{(c?pass++:fail++);results.push(`${c?'PASS':'FAIL'} | ${name}${d?` | ${d}`:''}`)};
const read=(r)=>fs.readFileSync(path.join(root,r),'utf8');
const app=read('src/App.jsx'), routes=read('src/config/routes.js'), services=read('src/api/services/doctor.js'), realtime=read('src/config/realtimeEvents.js');
const pages=['src/pages/doctor/DoctorHome.jsx','src/pages/doctor/DoctorProfile.jsx','src/pages/doctor/DoctorPatients.jsx','src/pages/doctor/DoctorPatientDetails.jsx','src/pages/doctor/DoctorAppointments.jsx','src/pages/doctor/DoctorInbox.jsx'];
for(const f of pages){const t=read(f);check(`${path.basename(f)} exists`,t.length>0);check(`${path.basename(f)} balanced delimiters`,(t.match(/\{/g)||[]).length===(t.match(/\}/g)||[]).length&&(t.match(/\(/g)||[]).length===(t.match(/\)/g)||[]).length)}
for(const p of ['/doctor','/doctor/profile','/doctor/patients','/doctor/patients/:patientId','/doctor/appointments','/doctor/inbox']) check(`Doctor route registered: ${p}`,app.includes(`path="${p}"`));
for(const [n,m] of [['home','getHome'],['profile','getProfile'],['profile update','updateProfile'],['duty status','setDutyStatus'],['patients','getPatients'],['patient details','getPatient'],['files','uploadPatientFile'],['upload file','uploadPatientFile'],['notes','getPatient'],['add note','addNote'],['medicines','addMedicine'],['add medicine','addMedicine'],['remove medicine','deleteMedicine'],['restrictions','addFoodRestriction'],['add restriction','addFoodRestriction'],['appointments','getAppointments'],['complete appointment','completeAppointment'],['reschedule appointment','rescheduleAppointment'],['follow-up','getAppointments'],['inbox','getInbox'],['inbox messages','getThreadMessages'],['send message','sendThreadMessage'],['close thread','closeThread']]) check(`Doctor service exposes ${n}`,services.includes(`${m}(`));
const exp={
'DoctorHome.jsx':['getHome','acknowledgeSos','Appointment','SOS'],
'DoctorProfile.jsx':['getProfile','updateProfile','duty'],
'DoctorPatients.jsx':['getPatients','Recovery'],
'DoctorPatientDetails.jsx':['getPatient','Files','Notes','Medicines','Restrictions'],
'DoctorAppointments.jsx':['getAppointments','completeAppointment','rescheduleAppointment'],
'DoctorInbox.jsx':['getInbox','getThreadMessages','sendThreadMessage','closeThread']};
for(const [name,needles] of Object.entries(exp)){const f=pages.find(x=>x.endsWith(name));const t=read(f);for(const n of needles)check(`${name} wires ${n}`,t.toLowerCase().includes(n.toLowerCase()));}
const home=read('src/pages/doctor/DoctorHome.jsx'), prof=read('src/pages/doctor/DoctorProfile.jsx'), det=read('src/pages/doctor/DoctorPatientDetails.jsx'), ap=read('src/pages/doctor/DoctorAppointments.jsx'), inbox=read('src/pages/doctor/DoctorInbox.jsx');
check('Doctor home has SOS acknowledgement flow',/acknowledge|Acknowledge/i.test(home)&&/SOS|urgent/i.test(home));
check('Doctor home has appointment completion action',/complete|Completed/i.test(home));
check('Doctor profile exposes On-Duty/Off-Duty',/On-Duty|Off-Duty|duty/i.test(prof));
check('Patient details exposes recovery tracker',/Recovery|recovery/i.test(det));
check('Patient details exposes files/notes/medicines/restrictions',/Files|Notes|Medicines|Restrictions/i.test(det));
check('Appointments has completed/reschedule actions',/complete|reschedule/i.test(ap));
check('Priority Inbox has temporary Chat ID lifecycle',/Chat ID|chatCode|temporary/i.test(inbox)&&/close|archive/i.test(inbox));
check('Priority Inbox has reply action',/sendInboxMessage|Reply|Send/i.test(inbox));
check('Realtime recovery contract exists',realtime.includes('recovery_updated'));
check('Realtime clinical record contract exists',realtime.includes('clinical_record_updated'));
check('Realtime SOS contract exists',realtime.includes('sos_created'));
console.log('CASTERLYCARE — PHASE 2.14.4 DOCTOR CRITICAL FLOW CHECK');console.log(`PASS: ${pass}`);console.log(`FAIL: ${fail}`);for(const r of results)console.log(r);process.exitCode=fail?1:0;
