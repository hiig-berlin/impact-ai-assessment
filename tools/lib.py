import re, math
import xml.etree.ElementTree as ET
NS='http://www.w3.org/2000/svg'; AF='https://www.affinity.studio/'
ET.register_namespace('',NS); ET.register_namespace('xlink','http://www.w3.org/1999/xlink'); ET.register_namespace('affinity',AF)
# affine as (a,b,c,d,e,f) like SVG matrix
def mul(m,n):
    a,b,c,d,e,f=m; A,B,C,D,E,F=n
    return (a*A+c*B, b*A+d*B, a*C+c*D, b*C+d*D, a*E+c*F+e, b*E+d*F+f)
def inv(m):
    a,b,c,d,e,f=m; det=a*d-b*c
    return (d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det)
def app(m,p):
    a,b,c,d,e,f=m; x,y=p; return (a*x+c*y+e,b*x+d*y+f)
I=(1,0,0,1,0,0)
def rot(deg,cx=0,cy=0):
    t=math.radians(deg); co,si=math.cos(t),math.sin(t)
    return (co,si,-si,co,cx-co*cx+si*cy,cy-si*cx-co*cy)
def mat(tr):
    M=I
    if not tr: return M
    for name,args in re.findall(r'(\w+)\(([^)]*)\)',tr):
        a=[float(v) for v in re.split(r'[ ,]+',args.strip())]
        if name=='matrix': m=tuple(a)
        elif name=='translate': m=(1,0,0,1,a[0],a[1] if len(a)>1 else 0)
        elif name=='rotate': m=rot(a[0],*(a[1:3] if len(a)==3 else (0,0)))
        elif name=='scale': m=(a[0],0,0,a[1] if len(a)>1 else a[0],0,0)
        M=mul(M,m)
    return M
def fmt(m): return 'matrix(%s)'%','.join('%.6f'%v for v in m)
def tag(e): return e.tag.split('}')[1]
def pathpts(d):
    nums=[float(v) for v in re.findall(r'-?\d*\.?\d+(?:e-?\d+)?',d)]
    return list(zip(nums[0::2],nums[1::2]))
def leaf_point(e):
    if tag(e)=='path':
        p=pathpts(e.get('d')); return (sum(x for x,_ in p)/len(p),sum(y for _,y in p)/len(p))
    if tag(e)=='text':
        x=float(e.get('x').split()[0].rstrip('px')); y=float(e.get('y').split()[0].rstrip('px')); return (x,y)
    return None
