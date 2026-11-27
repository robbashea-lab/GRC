import {r4FrameworkSource} from '@/lib/r4FrameworkSource';
export default function R4FrameworkSource({framework,definition,configuration}){
  const source=r4FrameworkSource(framework,definition,configuration);
  const climate=framework==='iso-27001'&&definition.id==='4.1'?'Amendment 1:2024 requires determining whether climate change is relevant to ISMS context. Record the assessment basis here.':framework==='iso-27001'&&definition.id==='4.2'?'Amendment 1:2024 notes relevant interested parties can have climate-related requirements; this is not a universal climate-control list.':'';
  return <details className="r4-framework-source" open><summary>{source.label} · {source.id}</summary><p>{source.text}</p>{climate&&<p>{climate}</p>}{source.trigger&&<small>{source.trigger}</small>}<small>{source.qualification}</small>{source.url&&<a href={source.url} target="_blank" rel="noopener noreferrer">Source reference ↗</a>}</details>;
}
