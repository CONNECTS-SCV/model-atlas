import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Curieus — Model Atlas',description:'생명과학 AI 모델을 탐색하고, 비교하고, 변화의 근거를 확인하세요.'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="ko"><body>{children}</body></html>;}
