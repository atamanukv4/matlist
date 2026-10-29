# Набор точек для сверки встроенных функций WSP с WaterSteamPro 6.6 в Mathcad.
import json
PT = [(1e3,280),(1e5,300),(1e5,400),(1e6,500),(3e6,300),(3e6,500),(1e7,700),(8e7,500),(2e7,620),(2.5e7,650),(2.5e7,700),(5e7,800),(1e7,1000),(3e7,1500),(1e5,2000),(1e8,600),(2.2e7,647),(6e6,560)]
PTF = 'V D U S H CP CV W JOULETHOMPSON THERMCOND DYNVIS PRANDTLE KINVIS K DDDPH DDDHP PKW DC'.split()
TS = [273.16,280,300,373.15,450,550,620,640,647]
STF = 'PS DPDTS VSS DSS VSW DSW USS USW SSS SSW HSS HSW CPSS CPSW CVSS CVSW CVDPSS CVDPSW WSS WSW JOULETHOMPSONSS JOULETHOMPSONSW THERMCONDSS THERMCONDSW DYNVISSS DYNVISSW PRANDTLESS PRANDTLESW KINVISSS KINVISSW KSS KSW RS DDDPHSS DDDPHSW DDDHPSS DDDHPSW SURFTEN'.split()
PH = [(1e5,1e5),(1e5,1.5e6),(1e5,3e6),(1e6,3e6),(1e7,1.5e6),(2e7,2.2e6),(2.5e7,2.5e6),(3e7,2.8e6),(5e6,4e6),(1e7,3.4e6),(5e5,2.6e6),(2e7,3.5e6),(1.6e7,1.9e6),(1e3,2.6e6)]
PHF = 'T U V S CP CV W JOULETHOMPSON DYNVIS KINVIS PRANDTLE K THERMCOND X'.split()
PS = [(1e5,1000),(1e5,6000),(1e5,8000),(1e6,7000),(1e7,3500),(2e7,4500),(2.5e7,5000),(5e6,7500),(1e7,6500),(1e8,2000),(1e3,9000)]
PSF = 'T U V H CP CV W JOULETHOMPSON DYNVIS KINVIS PRANDTLE K THERMCOND X'.split()
HS = [(1e5,1000),(1e6,3000),(2.6e6,6000),(3e6,6500),(3.4e6,7000),(2.5e6,7.5e3),(2e6,4500),(1.8e6,4000),(3.5e6,6.8e3),(2.1e6,4.6e3),(4e6,8e3)]
HSF = 'P T V U CP CV W JOULETHOMPSON THERMCOND DYNVIS PRANDTLE KINVIS K X TS'.split()
STX = [(300,0.5),(400,0.9),(500,0.0),(600,1.0),(640,0.3)]
STXF = 'V D U S H CP CV W JOULETHOMPSON THERMCOND DYNVIS PRANDTLE KINVIS K'.split()
PTX = [(1e5,372.7559,0.5),(1e6,453.03,0.8),(1e6,500,0.5)]
PTXF = 'V D U S H CP CV W JOULETHOMPSON THERMCOND DYNVIS PRANDTLE KINVIS K DDDPH DDDHP'.split()
EXP = [(1.3e7,813,3e6,0.85),(3e6,773,1e5,0.9),(1e6,453.4,1e4,0.8),(1e5,300,1e6,0.85)]
EXPF = 'T V U H S CP CV W THERMCOND KINVIS DYNVIS PRANDTLE K JOULETHOMPSON X'.split()
MS = [(1e5,350),(1e6,430),(5e6,500)]
REG = {'1PT':[(3e6,300),(8e7,500),(1e5,350)], '2PT':[(3.5e3,300),(3e7,700),(1e6,500)], '3PT':[(2.5e7,650),(2.5e7,700),(5e7,700)], '5PT':[(3e7,1500),(1e5,2000)]}
REGF = 'V D U S H CP CV W JOULETHOMPSON'.split()
RT = [(500,650),(200,650),(700,700),(300,750)]
ex = []
for p,t in PT:
    for f in PTF: ex.append('wsp%sPT(%r, %r)'%(f,p,t))
    ex.append('wspRIPTL(%r, %r, 5.893*10^-7)'%(p,t))
    for f in ['WATERSTATEAREA','WATERSTATEAREA2','PHASESTATEPT']: ex.append('wsp%s(%r, %r)'%(f,p,t))
for t in TS:
    for f in STF: ex.append('wsp%sT(%r)'%(f,t))
for p,h in PH:
    for f in PHF: ex.append('wsp%sPH(%r, %r)'%(f,p,h))
    ex.append('wspWATERSTATEAREAPH(%r, %r)'%(p,h))
for p,s in PS:
    for f in PSF: ex.append('wsp%sPS(%r, %r)'%(f,p,s))
    ex.append('wspWATERSTATEAREAPS(%r, %r)'%(p,s))
for h,s in HS:
    for f in HSF: ex.append('wsp%sHS(%r, %r)'%(f,h,s))
    ex.append('wspWATERSTATEAREAHS(%r, %r)'%(h,s))
for t,x in STX:
    for f in STXF: ex.append('wsp%sSTX(%r, %r)'%(f,t,x))
for p,t,x in PTX:
    for f in PTXF: ex.append('wsp%sPTX(%r, %r, %r)'%(f,p,t,x))
for a in EXP:
    for f in EXPF: ex.append('wsp%sEXPANSIONPTPEFF(%r, %r, %r, %r)'%((f,)+a))
    for f in EXPF: ex.append('wsp%sEXPANSIONPTXPEFF(%r, %r, 0.95, %r, %r)'%((f,a[0],a[1],a[2],a[3])))
for p,t in MS:
    for f in 'V U S H CP CV W THERMCOND DYNVIS PRANDTLE KINVIS K JOULETHOMPSON'.split(): ex.append('wsp%sMSPT(%r, %r)'%(f,p,t))
for k,pts in REG.items():
    for p,t in pts:
        for f in REGF: ex.append('wsp%s%s(%r, %r)'%(f,k,p,t))
for r,t in RT:
    for f in ['P3','U3','S3','H3','CP3','CV3','W3','JOULETHOMPSON3']: ex.append('wsp%sRT(%r, %r)'%(f,r,t))
    for f in ['THERMCOND','DYNVIS','PKW','DC']: ex.append('wsp%sRT(%r, %r)'%(f,r,t))
    ex.append('wspRIRTL(%r, %r, 5.893*10^-7)'%(r,t))
misc = ['wspP23T(650)','wspT23P(3*10^7)','wspPSUBT(250)','wspPMELTIT(260)','wspTSP(10^6)','wspTSP(1.5*10^7)','wspPST(500)',
 'wspHB13S(3800)','wspTB23HS(2600000, 5200)','wspPB23HS(2600000, 5200)','wspP2B2CH(3500000)','wspH2B2CP(10^7)',
 'wspROUGHHSSS(6000)','wspROUGHHSWS(2000)','wspROUGHRSST(500)','wspROUGHRSWT(500)','wspR3PT(2.5*10^7, 650)','wspD3PT(2.5*10^7, 650)','wspR3PTR0(2.5*10^7, 650, 500)',
 'wspXSTV(400, 0.5)','wspXSTD(400, 2)','wspXSTU(400, 10^6)','wspXSTS(400, 5000)','wspXSTH(400, 1.5*10^6)','wspXSTCP(400, 3000)','wspXSTCV(400, 2000)','wspXSTW(400, 300)',
 'wspT1PH(10^7, 10^6)','wspT1PS(10^7, 2500)','wspP1HS(10^6, 2500)','wspT1HS(10^6, 2500)','wspT2PH(10^6, 3*10^6)','wspT2PS(10^6, 7000)','wspP2HS(3*10^6, 7000)','wspT2HS(3*10^6, 7000)',
 'wspT2APH(10^6, 3*10^6)','wspT2BPH(5*10^6, 3.5*10^6)','wspT2CPH(3*10^7, 2.8*10^6)','wspT2APS(10^6, 7000)','wspT2BPS(5*10^6, 6800)','wspT2CPS(3*10^7, 5200)',
 'wspT3PH(2.5*10^7, 2*10^6)','wspT3PS(2.5*10^7, 4200)','wspV3PH(2.5*10^7, 2*10^6)','wspV3PS(2.5*10^7, 4200)','wspP3HS(2*10^6, 4200)','wspT3HS(2*10^6, 4200)','wspV3HS(2*10^6, 4200)','wspT3RH(500, 2*10^6)',
 'wspT5PH(3*10^7, 5*10^6)','wspT5PS(3*10^7, 8000)','wspP5HS(5*10^6, 8500)','wspT5HS(5*10^6, 8500)',
 'wspPHS(3*10^6, 7000)','wspTHS(3*10^6, 7000)','wspXHS(2*10^6, 6000)','wspXPH(10^5, 1.5*10^6)','wspXPS(10^5, 5000)',
 'wspPTHS(3*10^6, 7000)','wspPT1HS(10^6, 2500)','wspPT2HS(3*10^6, 7000)','wspPT3HS(2*10^6, 4200)','wspRT3HS(2*10^6, 4200)','wspPT5HS(5*10^6, 8500)','wspTXSHS(2*10^6, 6000)',
 'wspPT1RH(900, 10^6)','wspPT2RH(5, 3*10^6)','wspPT5RH(1, 5*10^6)',
 'wspVUSHCVWDERPTPT(10^6, 500)','wspVUSHCVWDERPTSWT(400)','wspVUSHCVWDERPTSST(400)','wspVUSHCVWDERPT1PT(3*10^6, 300)','wspVUSHCVWDERPT2PT(10^6, 500)','wspVUSHCVWDERPT3PT(2.5*10^7, 650)','wspVUSHCVWDERPT3RT(500, 650)','wspVUSHCVWDERPT5PT(3*10^7, 1500)','wspVUSHCVWDERPTMSPT(10^5, 350)',
 'wspGETTOLERANCE(0)','wspGETTOLERANCEMODE(0)','wspGETCHECKRANGEMODE(0)','wspGETDELTATS(0)','wspGETMAXITERATION(0)','wspGETDELTAPRESSURE(0)','wspGETINITWATERDENSITY(0)','wspGETINITSTEAMDENSITY(0)','wspGETABSOLUTEGASCONSTANT(0)','wspGETLASTERROR(0)','wspgGETCALCDISSMODE(0)']
ex += misc
# iap*
for p,t in [(1e6,500),(3e6,300),(2.5e7,650),(3e7,1500)]:
    for f in 'H S V D U CP CV W K DYNVIS KINVIS THERMCOND PRANDTLE'.split(): ex.append('iap%sPT(%r, %r)'%(f,p,t))
    ex.append('iapREGIONPT(%r, %r)'%(p,t))
for p,h in [(1e5,1.5e6),(1e6,3e6),(2.5e7,2e6)]:
    for f in 'T S V D X'.split(): ex.append('iap%sPH(%r, %r)'%(f,p,h))
for p,s in [(1e5,5000),(1e6,7000),(1e7,3500)]:
    for f in 'T H V D X'.split(): ex.append('iap%sPS(%r, %r)'%(f,p,s))
for h,s in [(3e6,7000),(2e6,6000),(1e6,2500)]:
    for f in 'P T V X'.split(): ex.append('iap%sHS(%r, %r)'%(f,h,s))
for f in 'H S V'.split(): ex += ['iap%sPTX(10^6, 453.03, 0.8)'%f, 'iap%sPTX(10^6, 500, 0.8)'%f]
for f in 'H T S X'.split(): ex += ['iap%sEXPANSIONPTPEFF(1.3*10^7, 813, 3*10^6, 0.85)'%f, 'iap%sEXPANSIONPTPEFF(10^6, 453.4, 10^4, 0.8)'%f]
for t in [300,450,620]:
    for f in 'PS TS HSW HSS SSW SSS VSW VSS DSW DSS RS'.split():
        ex.append(('iapTSP(%r)'%(t*1e4)) if f=='TS' else 'iap%sT(%r)'%(f,t))
json.dump(ex, open('ref_exprs.json','w'))
print(len(ex))
