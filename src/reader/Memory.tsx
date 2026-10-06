import { Brain } from 'lucide-react'
import { MemoryPanel } from '../components/Memory'

/** Người đọc: xem, sửa hoặc bảo trợ lý quên những điều đã ghi nhớ về mình. */
export default function ReaderMemory() {
  return (
    <div className="flex flex-col gap-5 max-w-[980px] mx-auto w-full">
      <div><h1 className="rd-h2 !text-[1.8em]"><Brain size={30} className="text-brand-600" />Trợ lý ghi nhớ gì về tôi</h1>
        <p className="rd-sub !mb-0">Những điều trợ lý nhớ để giúp bạn nhanh hơn ở lần sau. Bạn toàn quyền sửa hoặc xóa.</p></div>
      <MemoryPanel plain />
    </div>)
}
