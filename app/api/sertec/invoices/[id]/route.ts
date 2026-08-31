import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { ensureSertecInit, getInvoiceWithDetail } from '@/lib/sertec-db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await ensureSertecInit();

  const invoice = await getInvoiceWithDetail(Number(params.id));
  if (!invoice) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ invoice });
}
