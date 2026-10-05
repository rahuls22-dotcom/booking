/* Team ▸ Schedule Meetings. The advisors are fixed and the client changes, which is the
   RM's problem working down a call list. Booking joins the same review-then-send path as
   the client-first screen. */
(function(){
const NS=window.ProsperrAdvisorConsoleDS_c294ad;
const {Card,Avatar,Button,Icon,Field,Input,Modal,SearchInput,EmptyState,Note,Tag,TierChip}=NS;
const B=window.BK;

const TEAM_MENU=['Schedule Meetings','Onboard Advisors','Manage Advisors','Bulk Advisor Assignment','CSR Assignment','CSR Auto Assignment','Time Slot Config'];
const ADVISORS=B.STAFF.filter(s=>/Advisor/.test(s.role));
const isInternal=e=>e.toLowerCase().endsWith('@'+B.DOMAIN);

/* Each advisor's bookable window per weekday, as Time Slot Config sets it: a slot every
   (length + gap) minutes between From and To. Kept here so the client-first screen keeps
   the availability rules it was designed with. */
const SLOT_CONFIG={
  a1:{days:[1,2,3,4,5,6],from:660,to:810,len:30,gap:30},
  a2:{days:[1,2,3,4,5],  from:630,to:840,len:30,gap:15},
  a3:{days:[1,2,3,4,5,6],from:900,to:1110,len:45,gap:15},
  a4:{days:[2,3,4,5],    from:660,to:1020,len:30,gap:60},
  a5:{days:[1,2,3,4,5],  from:570,to:780,len:30,gap:30},
  a6:{days:[1,3,5],      from:840,to:1080,len:30,gap:30},
  a7:{days:[1,2,3,4,5,6],from:660,to:810,len:30,gap:30},
  a8:{days:[1,2,3,4,5],  from:600,to:960,len:30,gap:60},
  a9:{days:[2,3,4,5,6],  from:660,to:930,len:45,gap:15},
  w1:{days:[1,3,5],      from:960,to:1140,len:60,gap:0},
};
const cfgOf=id=>SLOT_CONFIG[id]||{days:[1,2,3,4,5,6],from:B.DAY_START,to:B.DAY_END,len:30,gap:30};
const worksOn=(id,date)=>cfgOf(id).days.includes(new Date(date+'T00:00:00').getDay());
const windowLabel=id=>{const c=cfgOf(id);return B.fmtT(c.from)+' – '+B.fmtT(c.to);};
const clientsOf=id=>B.USERS.filter(u=>u.advisorId===id||u.secondaryId===id);
const merge=l=>{l.sort((a,b)=>a[0]-b[0]);const m=[];for(const b of l){const x=m[m.length-1];if(x&&b[0]<=x[1])x[1]=Math.max(x[1],b[1]);else m.push([b[0],b[1]]);}return m;};

/* Free time, as a calendar shows it: the advisor's working window with what is
   actually booked cut out of it. Everything left is bookable.

   This replaces a stepped slot generator that walked `len + gap` and emitted a
   `len`-long pill each step. With a 30-minute length and a 60-minute gap that
   offered four slots in a six-hour day and left the other four hours rendering
   as plain white — not free, not busy, not outside hours. An RM reading that
   board sees empty time they cannot click and reasonably asks why.

   The gap was a booking cadence, not a statement about availability. Cadence
   belongs at the moment of booking, not in what the calendar claims is free. */
function freeBands(id,date){
  const c=cfgOf(id);
  if(!worksOn(id,date))return [];
  let open=[[c.from,c.to]];
  if(date===B.TODAY){
    const floor=B.NOW_MIN+30;                 // no booking into the next half hour
    open=open.map(b=>[Math.max(b[0],floor),b[1]]).filter(b=>b[1]>b[0]);
  }
  return open;
}

/* Subtract busy from the working window. Returns the gaps that remain. */
function subtract(bands,busy){
  let out=bands;
  for(const b of busy){
    const next=[];
    for(const [s,e] of out){
      if(b[1]<=s||b[0]>=e){next.push([s,e]);continue;}
      if(b[0]>s)next.push([s,b[0]]);
      if(b[1]<e)next.push([b[1],e]);
    }
    out=next;
  }
  return out.filter(([s,e])=>e-s>=MIN_BOOKABLE);
}
/* A sliver too short to hold the shortest call is not free time. */
const MIN_BOOKABLE=15;
/* Clicking a band books from where the pointer landed, snapped to the quarter
   hour, which is how a calendar behaves. */
const SNAP=15;
const snap=m=>Math.round(m/SNAP)*SNAP;

/* ---------------------------------------------------------------- the top menu -- */
/* Scheduling is opened many times a day; the other six are quarterly setup. Lifting it
   above a divider makes the menu answer "what am I here to do" before listing what exists. */
function TeamMenu({x,item,onPick,onClose}){
  return <React.Fragment>
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:60}}/>
    <div style={{position:'fixed',top:52,left:x,zIndex:61,width:268,background:'var(--surface)',
      border:'1px solid var(--border)',borderRadius:12,boxShadow:'0 14px 40px rgba(20,26,45,.18)',
      overflow:'hidden',padding:'6px 0'}}>
      {TEAM_MENU.map(m=><button key={m} type="button" onClick={()=>onPick(m)}
        style={{display:'block',width:'100%',padding:'10px 16px',border:0,
          background:item===m?'var(--tint)':'none',font:'inherit',fontSize:13.5,
          fontWeight:item===m?600:400,color:item===m?'var(--navy-deep)':'var(--ink)',
          textAlign:'left',cursor:'pointer'}}>{m}</button>)}
    </div>
  </React.Fragment>;
}

/* --------------------------------------------------------------- section router -- */
function TeamSection({item,appts,tweaks,onQuickBook,toast,team}){
  const ROSTER=ADVISORS;
  return item==='Schedule Meetings'
    ? <ScheduleMeetings appts={appts} tweaks={tweaks} onQuickBook={onQuickBook} toast={toast} team={team} roster={ROSTER}/>
    : <Card><EmptyState>{item} isn&rsquo;t part of this prototype. Pick <b>Schedule Meetings</b> from the Team menu.</EmptyState></Card>;
}

/* ------------------------------------------------------------- schedule meetings -- */
const PXM=0.62;
const y=m=>(m-B.GRID_START)*PXM;
const hours=(()=>{const o=[];for(let m=Math.ceil(B.GRID_START/60)*60;m<=B.GRID_END;m+=60)o.push(m);return o;})();

function ScheduleMeetings({appts,tweaks,onQuickBook,team,roster}){
  const ROSTER=roster||ADVISORS;
  const [t,setT]=team;
  const {ids,date,offset}=t;
  const setIds=fn=>setT(v=>({...v,ids:typeof fn==='function'?fn(v.ids):fn}));
  const setDate=d=>setT(v=>({...v,date:d}));
  const setOffset=fn=>setT(v=>({...v,offset:typeof fn==='function'?fn(v.offset):fn}));

  const [q,setQ]=React.useState('');
  const [filter,setFilter]=React.useState('All');
  const [pick,setPick]=React.useState(null);       // {advisor,start,end}
  const [blocked,setBlocked]=React.useState(null); // {advisor,block}

  /* The RM reads the board first and picks a slot; what the call is for is
     asked afterwards, in the panel. So the grid shows each advisor's own
     bookable slots at their configured length, with nothing to choose first. */
  const ready=true;

  const days=B.weekDays(offset);
  const shown=ROSTER.filter(a=>ids.includes(a.id));

  const takenFor=id=>appts.filter(a=>a.status==='Scheduled'&&a.people.includes(id));
  const blocksFor=(id,d)=>merge(B.busyFor(id,d).map(b=>[b[0],b[1]])
    .concat(takenFor(id).filter(x=>x.date===d).map(x=>[x.start,x.start+x.dur])));
  const freeOn=(id,d)=>subtract(freeBands(id,d),blocksFor(id,d));
  /* "Open" counts how many calls of this advisor's usual length still fit, so
     the number means something next to a band that is hours long. */
  const openSlots=(id,d)=>{
    const len=cfgOf(id).len;
    return freeOn(id,d).reduce((a,[s,e])=>{
      const n=Math.floor((e-s)/len);
      for(let k=0;k<n;k++)a.push([s+k*len,s+(k+1)*len]);
      return a;
    },[]);
  };
  const openOn=d=>shown.reduce((n,a)=>n+openSlots(a.id,d).length,0);

  React.useEffect(()=>{
    if(!ids.length)return;
    if(openOn(date)>0&&days.includes(date))return;
    const better=days.find(d=>openOn(d)>0);
    if(better)setDate(better);
  },[ids.join(','),offset]);

  /* The rail is a ranking, not a roster: what is open on this date decides the order. */
  const ranked=ROSTER
    .map(a=>({a,open:openSlots(a.id,date).length,clients:clientsOf(a.id).length}))
    .filter(r=>{
      if(filter==='Tax'&&!/^Tax/.test(r.a.role))return false;
      if(filter==='Wealth'&&!/Wealth/.test(r.a.role))return false;
      if(filter==='Open'&&!r.open)return false;
      const s=q.trim().toLowerCase();
      return !s||r.a.name.toLowerCase().includes(s)||r.a.role.toLowerCase().includes(s);
    })
    .sort((x,z)=>z.open-x.open||x.a.name.localeCompare(z.a.name));

  const counts={All:ROSTER.length,
    Tax:ROSTER.filter(a=>/^Tax/.test(a.role)).length,
    Wealth:ROSTER.filter(a=>/Wealth/.test(a.role)).length,
    Open:ROSTER.filter(a=>openSlots(a.id,date).length).length};

  const toggle=id=>setIds(x=>x.includes(id)?x.filter(i=>i!==id):[...x,id]);

  const nextFree=id=>{
    for(const d of days){
      if(d<date)continue;
      const s=openSlots(id,d);
      if(s.length)return {date:d,start:s[0][0]};
    }
    return null;
  };

  const cols='54px repeat('+Math.max(shown.length,1)+',minmax(0,1fr))';
  const nowVisible=date===B.TODAY&&B.NOW_MIN>B.GRID_START&&B.NOW_MIN<B.GRID_END;
  const total=openOn(date);

  return <div>
    <div className="ptitle">
      <div>
        <h2>Schedule meetings</h2>
        {/* The rail only ever lists calendars this persona may book into, so say
            whose they are rather than implying the whole firm is missing. */}
        <div className="sub">{ROSTER.length===1
          ?<React.Fragment>Your own calendar. Tick yourself on the left to see the day.</React.Fragment>
          :ROSTER.length<ADVISORS.length
            ?<React.Fragment>Your {ROSTER.length} {/Wealth/.test(ROSTER[0].role)?'wealth':'tax'} advisors &mdash; tick them on the left as you go.</React.Fragment>
            :<React.Fragment>Tick advisors on the left &mdash; their columns appear and disappear as you go.</React.Fragment>}</div>
      </div>
      {!!shown.length&&<span style={{background:'var(--green-soft)',color:'var(--green-deep)',
        border:'1px solid #bfe3cb',borderRadius:20,padding:'7px 13px',fontSize:12.5,fontWeight:700}}>
        {shown.length} selected &middot; {total} open on {B.fmtD(date)}</span>}
    </div>

    {/* One screen: the roster stays beside the calendar, so adding or dropping an
        advisor is a tick against the grid rather than a trip to another step. */}
    <div style={{display:'grid',gridTemplateColumns:'262px minmax(0,1fr)',gap:14,alignItems:'start'}}>

      <Card>
        <div className="pc-chdr" style={{height:'auto',padding:'11px 14px',display:'flex',alignItems:'center',gap:8}}>
          <span style={{flex:1,fontSize:12.5,fontWeight:700}}>Advisors</span>
          {!!shown.length&&<button type="button" onClick={()=>setIds([])}
            style={{border:0,background:'none',font:'inherit',fontSize:11.5,fontWeight:700,
              color:'var(--navy)',cursor:'pointer',padding:0}}>Clear</button>}
          <button type="button" onClick={()=>setIds(ROSTER.map(a=>a.id))}
            style={{border:0,background:'none',font:'inherit',fontSize:11.5,fontWeight:700,
              color:'var(--navy)',cursor:'pointer',padding:0}}>All</button>
        </div>

        <div style={{padding:'10px 12px',display:'grid',gap:8,borderBottom:'1px solid var(--border)'}}>
          <SearchInput value={q} onChange={setQ} placeholder="Search advisors"/>
          {!ready&&<div style={{fontSize:11.5,color:'var(--ink-3)',lineHeight:1.5}}>
            Choose the call type above, then pick who it is with.
          </div>}
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {['All','Tax','Wealth','Open'].map(f=><button key={f} type="button" onClick={()=>setFilter(f)}
              style={{padding:'4px 9px',borderRadius:20,cursor:'pointer',font:'inherit',fontSize:11.5,
                fontWeight:filter===f?700:600,
                border:'1px solid '+(filter===f?'var(--navy)':'var(--border)'),
                background:filter===f?'var(--tint)':'var(--surface)',
                color:filter===f?'var(--navy-deep)':'var(--ink-2)'}}>
              {f==='Open'?'Open now':f} {counts[f]}
            </button>)}
          </div>
        </div>

        <div style={{maxHeight:470,overflowY:'auto',padding:6}}>
          {ranked.map(({a,open,clients})=>{
            const on=ids.includes(a.id);
            return <label key={a.id} style={{display:'flex',alignItems:'center',gap:9,padding:'8px 8px',
              borderRadius:9,cursor:'pointer',opacity:on&&!open?.62:1,
              background:on?'var(--tint)':'transparent'}}>
              <input type="checkbox" checked={on} disabled={!ready} onChange={()=>toggle(a.id)}
                style={{width:15,height:15,accentColor:'var(--navy)',flex:'none'}}/>
              <Avatar name={a.name} size={26}/>
              <span style={{flex:1,minWidth:0}}>
                <span style={{display:'block',fontSize:12.5,fontWeight:700,whiteSpace:'nowrap',
                  overflow:'hidden',textOverflow:'ellipsis'}}>{a.name}</span>
                <span style={{display:'block',fontSize:10.5,color:'var(--ink-2)',whiteSpace:'nowrap',
                  overflow:'hidden',textOverflow:'ellipsis'}}>{clients} clients &middot; {windowLabel(a.id)}</span>
              </span>
              {/* Availability is answered after you pick who the call is with,
                  not advertised against every name before you have chosen. */}
              {on&&<span style={{flex:'none',fontFamily:'var(--mono)',fontSize:13,fontWeight:600,
                color:open?'var(--green-deep)':'var(--ink-3)'}}>{open}</span>}
            </label>;
          })}
          {!ranked.length&&<div className="muted" style={{padding:'14px 8px',fontSize:12}}>No advisor matches that.</div>}
        </div>
      </Card>

      <Card>
        {tweaks&&tweaks.googleDown
          ? <div className="pad"><Note icon={<Icon name="alert" size={14}/>}>
              Google Calendar is unreachable, so free/busy cannot be read. Nothing here is verified.
            </Note></div>
          : <React.Fragment>

          <div className="dstrip">
            <button className="navbtn" onClick={()=>setOffset(o=>o-1)} disabled={offset<=0} aria-label="Previous week">&lsaquo;</button>
            <div className="days">
              {days.map(d=>{
                const works=shown.length?shown.some(a=>worksOn(a.id,d)):true;
                const n=works?openOn(d):0;
                return <button key={d} className={'dchip'+(d===date?' on':'')+(works?'':' off')+(d===B.TODAY?' today':'')}
                  onClick={()=>works&&setDate(d)} disabled={!works}>
                  <div className="w">{B.fmtD(d,{weekday:'short',day:undefined,month:undefined})}</div>
                  <div className="d">{new Date(d+'T12:00:00+05:30').getDate()}</div>
                  <div className={'c '+(n?'some':'none')}>
                    {!shown.length?'\u2014':works?(n?n+' open':'none'):'off'}
                  </div>
                </button>;
              })}
            </div>
            <button className="navbtn" onClick={()=>setOffset(o=>o+1)} aria-label="Next week">&rsaquo;</button>
          </div>

          {!ready
            ? <EmptyState>Choose what kind of call this is. Slot lengths follow the type.</EmptyState>
            : !shown.length
            ? <EmptyState>Tick an advisor on the left. Columns appear here as you do.</EmptyState>
            : <React.Fragment>
            <div className="ghead" style={{gridTemplateColumns:cols}}>
              <div/>
              {shown.map(a=>{const n=openSlots(a.id,date).length;return <div key={a.id}>
                <Avatar name={a.name} size={18} style={{fontSize:8}}/>
                <span className="gn">{a.name}</span>
                <span style={{color:n?'var(--green-deep)':'var(--ink-3)'}}>{n}</span>
                <button type="button" onClick={()=>toggle(a.id)} aria-label={'Remove '+a.name}
                  style={{border:0,background:'none',padding:0,marginLeft:2,color:'var(--ink-3)',cursor:'pointer',display:'flex'}}>
                  <Icon name="x" size={12}/>
                </button>
              </div>;})}
            </div>

            <div className="gscroll">
              <div className="gbody" style={{gridTemplateColumns:cols,height:y(B.GRID_END)}}>
                <div className="gcol gutter">
                  {hours.map(h=><span key={h} className="hl" style={{top:y(h)}}>{B.fmtT(h).replace(':00','')}</span>)}
                </div>
                {shown.map(a=>{
                  const c=cfgOf(a.id),on=worksOn(a.id,date);
                  const off=on?[[B.GRID_START,c.from],[c.to,B.GRID_END]]:[[B.GRID_START,B.GRID_END]];
                  return <div className="gcol" key={a.id}>
                    {hours.map(h=><div key={h} className="hline" style={{top:y(h)}}/>)}
                    {off.map(o=>o[1]>o[0]&&<div key={o[0]} className="offhrs" style={{top:y(o[0]),height:y(o[1])-y(o[0])}}/>)}
                    {!on&&<div className="busy" style={{top:y(c.from),height:26,background:'transparent',border:0}}>Not scheduled</div>}
                    {on&&blocksFor(a.id,date).filter(b=>b[1]>c.from&&b[0]<c.to).map(b=>{
                      const s=Math.max(b[0],c.from),e=Math.min(b[1],c.to);
                      return <button key={b[0]} className="busy" type="button"
                        onClick={()=>setBlocked({advisor:a,block:[s,e]})}
                        style={{top:y(s),height:Math.max(y(e)-y(s),16),cursor:'not-allowed',textAlign:'left',
                          font:'inherit',fontSize:10.5,fontWeight:600}}
                        title="Busy — not bookable">{y(e)-y(s)>=22?'Busy':''}</button>;
                    })}
                    {/* One block per stretch of free time, not per slot. Clicking
                        inside it starts the call where the pointer landed. */}
                    {on&&freeOn(a.id,date).map(([bs,be])=>{
                      const h=Math.max(y(be)-y(bs)-2,16);
                      return <button key={bs} className="slot free" type="button"
                        style={{top:y(bs),height:h}}
                        onClick={ev=>{
                          const r=ev.currentTarget.getBoundingClientRect();
                          const at=Math.min(Math.max(snap(bs+(ev.clientY-r.top)/PXM),bs),be-MIN_BOOKABLE);
                          setPick({advisor:a,start:at,end:Math.min(at+cfgOf(a.id).len,be)});
                        }}
                        title={'Free ' + B.fmtT(bs) + ' – ' + B.fmtT(be) + ' · click where the call should start'}>
                        <span>{B.fmtT(bs)} &ndash; {B.fmtT(be)} free</span>
                      </button>;
                    })}
                    {nowVisible&&<div className="nowline" style={{top:y(B.NOW_MIN)}}/>}
                  </div>;
                })}
              </div>
            </div>

            <div className="legend">
              <span><i style={{background:'var(--green-soft)',border:'1px solid #bfe3cb'}}/>Free &mdash; click anywhere to book</span>
              <span><i style={{background:'var(--surface-2)',border:'1px solid var(--border-2)'}}/>Busy &mdash; not bookable</span>
              <span><i style={{background:'repeating-linear-gradient(135deg,var(--surface-2) 0 6px,var(--surface-3) 6px 12px)'}}/>Outside their hours</span>
              <span style={{marginLeft:'auto'}}>Working hours from each advisor&rsquo;s Time Slot Config &middot; IST</span>
            </div>
          </React.Fragment>}
        </React.Fragment>}
      </Card>
    </div>

    {blocked&&<BusyNote blocked={blocked} date={date} next={nextFree(blocked.advisor.id)}
      onClose={()=>setBlocked(null)} onGo={d=>{setDate(d);setBlocked(null);}}/>}

    {pick&&<BookingPanel pick={pick} date={date} tweaks={tweaks}
      busy={blocksFor(pick.advisor.id,date)}
      onClose={()=>setPick(null)} onBook={onQuickBook}/>}
  </div>;
}

/* A taken block explains itself rather than being a dead pixel, and points somewhere. */
function BusyNote({blocked,date,next,onClose,onGo}){
  const {advisor,block}=blocked;
  return <Modal title={advisor.name.split(' ')[0]+' is booked '+B.fmtT(block[0])+' – '+B.fmtT(block[1])}
    subtitle="Booking over it would double-book them." onClose={onClose}
    footer={<React.Fragment>
      <Button variant="ghost" onClick={onClose}>Close</Button>
      {next&&<Button onClick={()=>onGo(next.date)}>Go to {B.fmtD(next.date)}</Button>}
    </React.Fragment>}>
    <Note icon={<Icon name="clock" size={14}/>}>
      {next
        ? <React.Fragment>Next opening for {advisor.name.split(' ')[0]}: <b>{B.fmtD(next.date)}, {B.fmtT(next.start)}</b>.</React.Fragment>
        : <React.Fragment>{advisor.name.split(' ')[0]} has nothing open this week. Try the next week, or another advisor who shares this client.</React.Fragment>}
    </Note>
  </Modal>;
}

/* ------------------------------------------------------------------ pick a client -- */
/* An advisor carries a couple of hundred clients, so this is a search box with results,
   not a list to scroll. The advisor and the time are already settled; the only open
   question is who the call is for. */
const SHOW=8;

/* The booking panel. Opens from the right against the calendar the RM was
   just reading, rather than covering it from the centre: the slot they picked
   is the context for everything asked here.

   Order follows how the work actually goes — slot first, off the board, then
   what the call is for, then who it is with. */
function BookingPanel({pick,date,tweaks,busy,onClose,onBook}){
  const {advisor,start}=pick;
  const DEFAULT_TYPE=B.CONSULT_TYPES[0];
  const [ctype,setCtype]=React.useState(DEFAULT_TYPE);
  const [durOverride,setDurOverride]=React.useState(null);
  const [customOpen,setCustomOpen]=React.useState(false);
  const [customVal,setCustomVal]=React.useState('');
  const [q,setQ]=React.useState('');
  const [client,setClient]=React.useState(null);
  const [extras,setExtras]=React.useState([]);
  const [guest,setGuest]=React.useState('');
  const [err,setErr]=React.useState('');

  /* The type carries a default length; it stays changeable, including to a
     value that is not on the list. */
  const dur=durOverride!=null?durOverride:B.durFor(ctype);
  const end=start+dur;
  const opts=B.DURATIONS.includes(dur)?B.DURATIONS:B.DURATIONS.concat([dur]).sort((a,b)=>a-b);
  const durLabel=m=>m%60===0&&m>=60?(m/60)+(m===60?' hour':' hours'):m+' minutes';

  /* A longer call can run into something already on the calendar, so the
     length is checked against the slot rather than assumed to fit. */
  const cfg=cfgOf(advisor.id);
  const overruns=end>cfg.to;
  const clash=(busy||[]).some(b=>B.overlaps(b,[start,end]));
  const fits=!overruns&&!clash;

  /* Typeahead over the advisor's book first, then everyone — name, phone or
     email, which is how an RM actually remembers a client. */
  const mine=React.useMemo(()=>clientsOf(advisor.id),[advisor.id]);
  const term=q.trim().toLowerCase();
  const match=(u,t)=>u.name.toLowerCase().includes(t)||u.email.toLowerCase().includes(t)
    ||u.phone.replace(/\s/g,'').includes(t.replace(/\s/g,''));
  const hits=React.useMemo(()=>{
    if(!term)return [];
    const own=mine.filter(u=>match(u,term));
    const rest=B.USERS.filter(u=>match(u,term)&&!own.includes(u));
    return own.concat(rest).slice(0,SHOW);
  },[term,mine]);

  const addGuest=()=>{
    const e=guest.trim();
    if(!e||!/^[^@\s]+@[^@\s]+$/.test(e))return;
    setExtras(x=>x.concat([{id:'g_'+e,name:e.split('@')[0],email:e,kind:'guest',hasCalendar:false}]));
    setGuest('');
  };

  const submit=()=>{
    if(!client||!fits)return;
    if(tweaks&&tweaks.simulateConflict){
      setErr(advisor.name.split(' ')[0]+' was booked into '+B.fmtT(start)+' a moment ago. Close this and pick another slot.');
      return;
    }
    const people=[
      {id:client.id,name:client.name,email:client.email,kind:'client',hasCalendar:false,locked:true},
      {...advisor,kind:'staff',hasCalendar:true},
    ].concat(extras);
    onBook({date,start,dur,type:ctype,agenda:ctype,fireflies:!!(tweaks&&tweaks.firefliesDefault),
      peopleObjs:people,external:people.some(p=>!isInternal(p.email))},client);
  };

  return <React.Fragment>
    <div className="bk-scrim" onClick={onClose}/>
    <aside className="bk-panel" role="dialog" aria-label="Book this slot">
      <div className="bk-head">
        <Avatar name={advisor.name} size={34}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:14}}>{B.fmtT(start)} &ndash; {B.fmtT(end)}</div>
          <div className="lbl" style={{marginTop:2}}>{B.fmtD(date)} &middot; {advisor.name}</div>
        </div>
        <button className="bk-x" onClick={onClose} aria-label="Close">&times;</button>
      </div>

      <div className="bk-body">
        <Field label="Agenda">
          <Input as="select" value={ctype}
            onChange={e=>{setCtype(e.target.value);setDurOverride(null);setCustomOpen(false);}}>
            {B.CONSULT_TYPES.map(x=><option key={x} value={x}>{x} &middot; {B.durFor(x)} min</option>)}
          </Input>
        </Field>

        <Field label="Length">
          {customOpen
            ? <span style={{display:'flex',gap:6,alignItems:'center'}}>
                <input className="pc-input" type="number" min="5" max="480" step="5" autoFocus
                  value={customVal} onChange={e=>setCustomVal(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){const n=Math.round(Number(customVal));
                    if(n>=5&&n<=480)setDurOverride(n);setCustomOpen(false);}
                    if(e.key==='Escape')setCustomOpen(false);}}
                  style={{width:90}}/>
                <span className="lbl">min</span>
                <Button variant="ghost" onClick={()=>{const n=Math.round(Number(customVal));
                  if(n>=5&&n<=480)setDurOverride(n);setCustomOpen(false);}}>Set</Button>
              </span>
            : <Input as="select" value={String(dur)}
                onChange={e=>{if(e.target.value==='custom'){setCustomVal(String(dur));setCustomOpen(true);return;}
                  setDurOverride(Number(e.target.value));}}>
                {opts.map(m=><option key={m} value={m}>{durLabel(m)}</option>)}
                <option value="custom">Custom&hellip;</option>
              </Input>}
          {!fits&&<div className="pc-note warn" style={{marginTop:8}}>
            {overruns
              ?advisor.name.split(' ')[0]+' finishes at '+B.fmtT(cfg.to)+', so a '+dur+'-minute call does not fit here.'
              :'A '+dur+'-minute call runs into something already booked. Shorten it or pick another slot.'}
          </div>}
        </Field>

        <Field label="Client">
          {client
            ? <div className="locked">
                <Avatar name={client.name} size={28}/>
                <div style={{flex:1,minWidth:0}}>
                  <div className="nm">{client.name} <TierChip tier={client.tier}/></div>
                  <div className="em">{client.phone} &middot; {client.email}</div>
                </div>
                <Button variant="ghost" onClick={()=>{setClient(null);setErr('');}}>Change</Button>
              </div>
            : <React.Fragment>
                <SearchInput value={q} onChange={setQ} placeholder="Search by name, phone or email"/>
                {term&&<div className="bk-res" style={{marginTop:8}}>
                  {hits.length?hits.map(u=>
                    <div key={u.id} className="dd-item" onClick={()=>{setClient(u);setQ('');}}>
                      <Avatar name={u.name} size={24}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600}}>{u.name}
                          {mine.includes(u)&&<span className="lbl" style={{marginLeft:6}}>their client</span>}</div>
                        <div className="r">{u.phone} &middot; {u.email}</div>
                      </div>
                    </div>)
                    :<div className="dd-item" style={{color:'var(--ink-3)'}}>No client matches &ldquo;{q.trim()}&rdquo;.</div>}
                </div>}
                {!term&&<div className="lbl" style={{marginTop:6}}>
                  Start typing a name, phone number or email.</div>}
              </React.Fragment>}
        </Field>

        <Field label="Anyone else (optional)">
          <span style={{display:'flex',gap:6}}>
            <Input value={guest} placeholder="name@company.com"
              onChange={e=>setGuest(e.target.value)}/>
            <Button variant="ghost" onClick={addGuest}>Add</Button>
          </span>
          {!!extras.length&&<div className="tokens" style={{marginTop:8,gap:6,display:'flex',flexWrap:'wrap'}}>
            {extras.map(p=><span key={p.id} className="bk-chip">
              <Avatar name={p.name} size={20}/>{p.email}
              <button onClick={()=>setExtras(x=>x.filter(y=>y.id!==p.id))} aria-label={'Remove '+p.email}>&times;</button>
            </span>)}
          </div>}
        </Field>

        {err&&<div className="pc-note warn">{err}</div>}
      </div>

      <div className="bk-foot">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!client||!fits}>
          {client?'Review invite':'Choose a client'}</Button>
      </div>
    </aside>
  </React.Fragment>;
}

Object.assign(window,{TeamSection,TeamMenu,TEAM_MENU});
})();
