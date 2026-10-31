import { EmptyState, PageHeader } from "@/components/ui";
import { BlogManager } from "@/components/platform/blog-manager";
import { BLOG_CATEGORIES } from "@/lib/marketing/blog";
import { listAllPostsFresh } from "@/lib/platform/blog";
import { requireHyperAdminPage } from "@/lib/platform/session";

export const dynamic = "force-dynamic";

export default async function PlatformBlogPage() {
  await requireHyperAdminPage("/platform/blog");
  const posts = await listAllPostsFresh().catch(() => null);
  if (!posts) return <EmptyState title="Blog yazıları yüklenemedi" description="Kayıtlar okunamadı. Sayfayı yenileyip tekrar deneyin." />;
  return (
    <div>
      <PageHeader title="Blog" description="Kategori seçin, başlığı ve yazıyı girin. Yayınladığınız anda sitede görünür, siteye dokunmanız gerekmez." />
      <BlogManager posts={posts} categories={BLOG_CATEGORIES} />
    </div>
  );
}
