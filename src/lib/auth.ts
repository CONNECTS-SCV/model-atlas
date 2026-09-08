import { timingSafeEqual } from 'node:crypto';
export function authorized(request:Request) {
 const expected=process.env.ADMIN_TOKEN;
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!expected||expected.length<24||!token)return false;
 const a=Buffer.from(token),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}
