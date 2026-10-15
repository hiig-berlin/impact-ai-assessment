import sys; sys.path.insert(0,'.')
from lib import *
C=(1240.1573801764202,1472.6339290861883)
def load(fn):
    t=ET.parse(fn); r=t.getroot()
    parent={c:p for p in r.iter() for c in p}
    return t,r,parent
def absmat(e,parent):
    chain=[]
    while e is not None: chain.append(e); e=parent.get(e)
    M=I
    for x in reversed(chain): M=mul(M,mat(x.get('transform')))
    return M
def angle_of(p):
    dx,dy=p[0]-C[0],p[1]-C[1]
    return (math.degrees(math.atan2(dx,-dy))+360)%360, math.hypot(dx,dy)
def text_of(e): return ''.join(e.itertext())
def fill(e):
    m=re.search(r'fill:([^;]+)',e.get('style','')); return m.group(1) if m else None
def items(r,parent,gid,leaf):
    g=[e for e in r.iter() if e.get('id')==gid][0]
    out=[]
    for ch in g:
        leaves=[x for x in ch.iter() if tag(x)==leaf]
        if not leaves: continue
        lf=leaves[0]
        M=absmat(lf,parent); p=app(M,leaf_point(lf))
        if leaf=='path':
            # use centroid of transformed points for accuracy
            pts=[app(M,q) for q in pathpts(lf.get('d'))]; p=(sum(x for x,_ in pts)/len(pts),sum(y for _,y in pts)/len(pts))
        a,rad=angle_of(p)
        out.append(dict(el=ch,leaf=lf,ang=a,rad=rad,slot=int(a//15)))
    return out
if __name__=='__main__':
    t,r,parent=load(sys.argv[1])
    for gid,leaf in [('Kriterienfarben','path'),('Nummerierung---außen','text'),('Kriterienschrift---mittig','text')]+[('Bewertungsskala-%d'%i,'path') for i in range(1,6)]:
        it=items(r,parent,gid,leaf)
        print(gid)
        for x in sorted(it,key=lambda x:x['ang']):
            print('  slot %2d ang %6.1f rad %6.1f %s %s'%(x['slot'],x['ang'],x['rad'],fill(x['leaf']) if leaf=='path' else '',text_of(x['leaf']) if leaf=='text' else x['el'].get('id')))
