import SertecShell from '@/components/sertec/SertecShell';

export default function SertecLayout({ children }: { children: React.ReactNode }) {
  return <SertecShell>{children}</SertecShell>;
}
