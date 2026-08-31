# Nevii Hub — Geliştirme İş Akışı (Tek Kaynak Düzeni)

Bu doküman, "hangi klasör güncel?", "değişikliklerim nerede?", "eski web
sürümüne mi bakıyorum?" gibi soruları kalıcı olarak ortadan kaldırmak için
yazıldı. Bu depoyla çalışan herkes (insan veya agent) bu kurallara uyar.

## 1. Kanonik düzen

| Ne | Değer |
|---|---|
| Kanonik klasör | `/Users/hidircanyagiz/Projects/notaplan` |
| Kanonik branch | `main` |
| Kanonik web URL | `http://localhost:3000/panel` |
| Kanonik mobil kaynak | `/Users/hidircanyagiz/Projects/notaplan/apps/mobile` |
| Geçici agent çalışması | yalnızca `.claude/worktrees/*` altında |

**"Güncel/latest sürüm" tanımı:** Güncel sürüm, kanonik branch (`main`)
üzerindeki en son onaylanmış (commit edilmiş ve entegre edilmiş) commit'tir —
rastgele bir worktree'deki uncommitted değişiklik değil, bir commit tarihi
değil, "en son üzerinde çalışılan klasör" hiç değil.

> `~/NeviiHub` sembolik bağlantısı hakkında: denetim sırasında bu bağlantının
> zaten var olduğu ama **yanlış klasöre** (`neviios-control` — kanonik olmayan
> bir worktree) işaret ettiği tespit edildi. Bunu düzeltmek için önerilen komut
> raporun "Bundan sonraki zorunlu iş akışı" bölümündedir; bu doküman o komut
> çalıştırılmadan da geçerlidir çünkü tüm yollar mutlak klasör yoluna göre
> tanımlıdır.

## 2. Günlük komutlar

Web sunucusunu başlatmak için:

```bash
cd /Users/hidircanyagiz/Projects/notaplan
./scripts/dev-web.sh
```

Mobil uygulamayı başlatmak için:

```bash
cd /Users/hidircanyagiz/Projects/notaplan
./scripts/dev-mobile.sh
```

Şu an hangi klasörde/branch'te/durumda olduğunuzu görmek için (herhangi bir
worktree içinden çalıştırılabilir):

```bash
./scripts/where-am-i.sh
```

## 3. Kurallar

1. **Tüm günlük geliştirme `/Users/hidircanyagiz/Projects/notaplan` kökünden
   başlar.** Başka bir klasörde "hızlıca bir şey deniyorum" diye çalışmayın.
2. **Her agent/özellik çalışması, kanonik `main`'den açılan yeni bir geçici
   worktree'de başlar** (`.claude/worktrees/<isim>`). Doğrudan `main`
   checkout'unu agent'a çalışma alanı olarak vermeyin.
3. **Bir worktree'deki değişiklikler; gözden geçirilip (review), test edilip,
   commit edilip, `main`'e entegre edilene kadar "güncel" sayılmaz.** Ne kadar
   yeni/etkileyici görünürse görünsün.
4. **Worktree'ler arasında `cp`/`rsync` ile dosya taşımayın.** Bir worktree'de
   yapılan iş, ya orada commit edilip normal git akışıyla (branch → main)
   entegre edilir, ya da terk edilir. Kopyalama, hangi kopyanın "gerçek"
   olduğunu bilinmez hale getirir — tam da önlemeye çalıştığımız sorun.
5. **Entegrasyon yalnızca gözden geçirilmiş, atomik commit'lerle olur** (bkz.
   `AGENTS.md` — Orion → Atlas → Prisma → Nova → Helios → Forge → Sentinel
   hattı). Squash/force-push ile sessizce geçmişi değiştirmeyin.
6. **Entegrasyondan sonra hem web hem mobil, kanonik çalışma alanından
   (`/Users/hidircanyagiz/Projects/notaplan`, `main` branch) yeniden test
   edilir.** Worktree içinde test edip "çalıştı" demek yeterli değildir.

## 4. Acil durum kurtarma

**"Eski bir sürüm görüyorum"**
1. `./scripts/where-am-i.sh` çalıştırın — hangi klasörde, hangi branch'te,
   hangi commit'te olduğunuzu gösterir.
2. Klasör kanonik değilse (`GEÇİCİ WORKTREE` veya `BİLİNMİYOR` çıktısı):
   `cd /Users/hidircanyagiz/Projects/notaplan` yapın.
3. Branch `main` değilse: `git status` ile önce kirli değişiklik olup
   olmadığına bakın, sonra `git checkout main` yapın.

**"Port 3000 dolu"**
1. `./scripts/dev-web.sh` çalıştırıldığında dolu ise, hangi PID/komutun ve
   hangi klasörden çalıştığının çıktısını verir.
2. O sürecin sizin kanonik sunucunuz olup olmadığını kontrol edin
   (`where-am-i.sh` çıktısındaki klasörle karşılaştırın).
3. Eskiyse kasıtlı olarak durdurun: `kill <PID>`. Script bunu sizin adınıza
   otomatik yapmaz — kasıtlı bir karar olmalı.

**"Özelliğim hangi worktree'deydi, bilmiyorum"**
1. `git worktree list` — tüm worktree'leri ve branch'lerini listeler.
2. Her worktree için `cd <yol> && git log -1 --oneline && git status --short`
   ile hangi işin nerede olduğunu görün.
3. Bu depoda geçmişte tam bir envanter çıkarılmıştır — güncel durum için
   yeniden `git worktree list` + yukarıdaki döngüyü çalıştırın; envanter
   zamanla eskir, komut çıktısı eskimez.

## 5. Durum sözlüğü

Bir özellik/worktree/branch için şu etiketlerden birini kullanın:

- **CANONICAL** — `main` branch üzerinde, commit edilmiş, kanonik klasörde.
- **IN REVIEW** — commit edilmiş, bir feature branch/worktree'de, `main`'e
  henüz entegre edilmemiş, gözden geçirme bekliyor.
- **EXPERIMENTAL** — bir worktree'de aktif geliştirilen, commit edilmemiş
  veya commit edilmiş ama kavram-kanıtı niteliğinde iş.
- **ARCHIVED-DO-NOT-USE** — `main`'den ciddi şekilde geride kalmış ve/veya
  aynı işin `main`'de farklı bir commit olarak zaten yapıldığı worktree'ler.
  Silinmemiştir (hiçbir şey silinmedi) ama "güncel" olarak kabul edilmemelidir.
