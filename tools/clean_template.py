import sys, subprocess; sys.path.insert(0,'.')
from analyze import *
SRC, OUT = sys.argv[1], sys.argv[2]
t,r,parent=load(SRC)
A='{%s}id'%AF
R_IN, R_OUT = 156.0, 870.0                 # criterion wedge
RING_IN, RING_OUT = 890.0, 1186.0          # five rating rings, equal width
RINGS=[(RING_IN+i*(RING_OUT-RING_IN)/5, RING_IN+(i+1)*(RING_OUT-RING_IN)/5) for i in range(5)]
STROKE=4
CATS=[('Impact','rgb(240,217,236)'),('Governance','rgb(255,244,213)'),('Social Sustainability','rgb(213,233,240)'),
      ('Environmental Sustainability','rgb(244,244,213)'),('Economic Sustainability','rgb(224,248,241)')]
CAT_OF={1:0,2:0,3:0,4:0,5:0,6:1,7:1,8:1,9:1,**{n:2 for n in range(10,21)},21:3,22:3,23:4,24:4}

def meas(font,size,lines):
    out=subprocess.run(['swift','measure.swift',font,str(size)],input='\n'.join(lines)+'\n',capture_output=True,text=True,check=True).stdout
    return [float(l.split('\t')[0]) for l in out.strip().split('\n')]
def pt(a,rad):
    a=math.radians(a); return (C[0]+rad*math.sin(a), C[1]-rad*math.cos(a))
def sector(a0,a1,r0,r1):
    p0,p1,p2,p3=pt(a0,r1),pt(a1,r1),pt(a1,r0),pt(a0,r0)
    f=lambda p:'%.3f,%.3f'%p
    return 'M%sA%.3f,%.3f 0 0,1 %sL%sA%.3f,%.3f 0 0,0 %sZ'%(f(p0),r1,r1,f(p1),f(p2),r0,r0,f(p3))

# ring colours per category and level, taken from the template (all rings are coloured there)
ringcol={}
for L in range(1,6):
    for x in items(r,parent,'Bewertungsskala-%d'%L,'path'):
        if 'niedrigere' in (x['el'].get('id') or ''): continue
        ringcol.setdefault((CAT_OF[x['slot']+1],L),fill(x['leaf']))

# evenly spaced shades: interpolate linearly from the wedge colour (level 0) to the level-5 colour
rgb=lambda v:[int(x) for x in re.findall(r'\d+',v)]
for c,(name,base) in enumerate(CATS):
    b,top=rgb(base),rgb(ringcol[(c,5)])
    for L in range(1,6):
        ringcol[(c,L)]='rgb(%d,%d,%d)'%tuple(round(b[i]+(top[i]-b[i])*L/5) for i in range(3))
# legend tiles: per colour group the first six filled paths are base, level 1..5
LEG={'Lila':0,'Gelb':1,'Blau':2,'Grün':3,'Türkis':4}
for g in [e for e in r.iter() if e.get('id')=='Kacheln'][0]:
    if g.get('id') not in LEG: continue
    c=LEG[g.get('id')]; filled=[p for p in g.iter() if tag(p)=='path' and fill(p)]
    for L,p in enumerate(filled[:6]):
        col=CATS[c][1] if L==0 else ringcol[(c,L)]
        p.set('style',re.sub(r'fill:[^;]+','fill:'+col,p.get('style')))
# text: reuse the designer's layout of position 0 (right half) and position 12 (left half)
txt={}
for gid,font,fs in [('Nummerierung---außen','PTSans-Bold',37.5),('Kriterienschrift---mittig','PTSans-Regular',41.667)]:
    it={x['slot']:x for x in items(r,parent,gid,'text')}
    strings=[text_of(it[s]['leaf']) for s in range(24)]
    ws=meas(font,fs,strings)
    frames={side:absmat(it[s]['leaf'],parent) for side,s in (('R',0),('L',12))}
    y0=float(it[0]['leaf'].get('y').split()[0].rstrip('px'))
    style=it[0]['leaf'].get('style')
    txt[gid]=dict(strings=strings,ws=ws,frames=frames,y0=y0,style=style)
NUM_C=1684.45; LAB_R=1658.0; LAB_L=2371.8      # number centre, label start (right) / label end (left), local x

# legend: English ids that don't clash with the diagram's category groups (Legend-Impact …),
# plain text without Affinity's letter-split tspans and without ligature characters
leg=[e for e in r if e.get('id')=='Legende'][0]
leg.set('id','Legend'); leg.set(A,'Legend')
tiles=[e for e in leg.iter() if e.get('id')=='Kacheln'][0]
tiles.set('id','Legend-Tiles'); tiles.set(A,'Tiles')
for g in tiles:
    grey=g.get('id')=='Grau'
    name='Grey' if grey else CATS[LEG[g.get('id')]][0]
    slug='Legend-'+re.sub(r'\W+','-',name)
    g.set('id',slug); g.set(A,name)
    level=1 if grey else 0
    for ch in g:
        if any(tag(x)=='text' for x in ch.iter()):
            ch.set('id','Legend-Score-Names' if grey else slug+'-label'); ch.set(A,'Score names' if grey else 'Label')
        else:
            kind='tile' if grey else 'level'
            ch.set('id','%s-%s%d'%(slug,kind,level)); ch.set(A,'%s %d'%(kind.title(),level)); level+=1
for e in leg.iter():
    if tag(e)=='text':
        s=''.join(e.itertext()).replace('ﬁ','fi').replace('ﬂ','fl')
        for ch in list(e): e.remove(ch)
        e.text=s

svg=ET.Element(r.tag, r.attrib)
svg.append(leg)
diag=ET.SubElement(svg,'{%s}g'%NS,{'id':'Diagram',A:'Diagram'})
catg=[ET.SubElement(diag,'{%s}g'%NS,{'id':re.sub(r'\W+','-',n),A:n}) for n,_ in CATS]
for p in range(24):
    n=p+1; cat=CAT_OF[n]; label=txt['Kriterienschrift---mittig']['strings'][p]
    g=ET.SubElement(catg[cat],'{%s}g'%NS,{'id':'C%02d'%n,A:'%02d %s'%(n,label)})
    a0,a1=p*15,(p+1)*15
    ET.SubElement(g,'{%s}path'%NS,{'id':'C%02d-wedge'%n,A:'Wedge','d':sector(a0,a1,R_IN,R_OUT),
        'style':'fill:%s;stroke:white;stroke-width:%dpx;'%(CATS[cat][1],STROKE)})
    for L,(q0,q1) in enumerate(RINGS,1):
        ET.SubElement(g,'{%s}path'%NS,{'id':'C%02d-rating%d'%(n,L),A:'Rating %d'%L,'d':sector(a0,a1,q0,q1),
            'style':'fill:%s;stroke:white;stroke-width:%dpx;'%(ringcol[(cat,L)],STROKE)})
    side='R' if p<12 else 'L'; base=0 if side=='R' else 12
    for gid,kind in [('Nummerierung---außen','number'),('Kriterienschrift---mittig','label')]:
        T=txt[gid]; w=T['ws'][p]
        M=mul(rot((p-base)*15,*C),T['frames'][side])
        if kind=='number': x=NUM_C-w/2
        else: x=LAB_R if side=='R' else LAB_L-w
        e=ET.SubElement(g,'{%s}text'%NS,{'id':'C%02d-%s'%(n,kind),A:kind.title(),'transform':fmt(M),'x':'%.3fpx'%x,'y':'%.3fpx'%T['y0'],'style':T['style']})
        e.text=T['strings'][p]
# category centre pie (shown when clustering by category, hidden when clustering by rating)
HUB_R, ICON_R = 148.0, 102.0
SPANS=[(0,75),(75,135),(135,300),(300,330),(330,360)]       # follows criteria 1-5 | 6-9 | 10-20 | 21-22 | 23-24
HUBCOL=[ringcol[(c,5)] for c in range(5)]
hubsrc=[e for e in r.iter() if e.get('id')=='Icons-Grafik--A6A6A6'][0]
icons=[]
for ig in hubsrc:
    paths=[(p,absmat(p,parent)) for p in ig.iter() if tag(p)=='path']
    pts=[app(M,q) for p,M in paths for q in pathpts(p.get('d'))]
    bc=((min(x for x,_ in pts)+max(x for x,_ in pts))/2,(min(y for _,y in pts)+max(y for _,y in pts))/2)
    icons.append((angle_of(bc)[0],bc,paths))
centre=ET.SubElement(svg,'{%s}g'%NS,{'id':'Centre',A:'Centre'})
for c,(a0,a1) in enumerate(SPANS):
    name=CATS[c][0]; cg=ET.SubElement(centre,'{%s}g'%NS,{'id':'Centre-'+re.sub(r'\W+','-',name),A:name})
    p0,p1=pt(a0,HUB_R),pt(a1,HUB_R)
    ET.SubElement(cg,'{%s}path'%NS,{A:'Sector','d':'M%.3f,%.3fL%.3f,%.3fA%.1f,%.1f 0 %d,1 %.3f,%.3fZ'%(C[0],C[1],*p0,HUB_R,HUB_R,1 if a1-a0>180 else 0,*p1),
        'style':'fill:%s;stroke:white;stroke-width:%dpx;'%(HUBCOL[c],STROKE)})
    mid=(a0+a1)/2
    ang,bc,paths=min(icons,key=lambda i:min(abs(i[0]-mid),360-abs(i[0]-mid)))
    tgt=pt(mid,ICON_R)
    ig=ET.SubElement(cg,'{%s}g'%NS,{A:'Icon','transform':'translate(%.3f,%.3f)'%(tgt[0]-bc[0],tgt[1]-bc[1])})
    for p,M in paths:
        ET.SubElement(ig,'{%s}path'%NS,{'d':p.get('d'),'transform':fmt(M),'style':p.get('style')})
ET.ElementTree(svg).write(OUT,xml_declaration=True,encoding='UTF-8')
print('ring colours',ringcol)
