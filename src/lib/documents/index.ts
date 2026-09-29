/**
 * PRODUCT_BACKLOG §6 Faz 1 — evrak şablon + örnek (JSON parity; DB when STORE_MODE=db).
 */

import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { uid } from "../utils";
import { buildDocumentReference } from "../document-reference";
import { sanitizeTemplateHtml } from "../document-sanitize";
import { formatDateTr } from "../timezone";
import type {
  DocumentInstance,
  DocumentInstanceStatus,
  DocumentTemplate,
  DocumentTemplateKind,
} from "../types";

const TPL_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "document-templates.json");
const INST_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "document-instances.json");

export const DOCUMENT_TEMPLATES_FILE = TPL_FILE;
export const DOCUMENT_INSTANCES_FILE = INST_FILE;

type StoredTpl = DocumentTemplate & { tenantId: string };
type StoredInst = DocumentInstance & { tenantId: string };

async function loadTpl(): Promise<StoredTpl[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(TPL_FILE, "utf8")) as StoredTpl[];
  } catch {
    return [];
  }
}
async function saveTpl(rows: StoredTpl[]) {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(TPL_FILE), { recursive: true });
  await fs.writeFile(TPL_FILE, JSON.stringify(rows, null, 2));
}
async function loadInst(): Promise<StoredInst[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(INST_FILE, "utf8")) as StoredInst[];
  } catch {
    return [];
  }
}
async function saveInst(rows: StoredInst[]) {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(INST_FILE), { recursive: true });
  await fs.writeFile(INST_FILE, JSON.stringify(rows, null, 2));
}

/**
 * FAZ (2026-2027 SÖZLEŞME KAYNAĞI) — kaynak:
 * /2026-2027-ogrenci-kayit-sozlesmesi-v1.md ("ÖZEL NİLÜFER ACAR MÜZİK
 * AKADEMİ KURSU · 2026-2027 EĞİTİM DÖNEMİ · ÖĞRENCİ KAYIT SÖZLEŞMESİ",
 * kurumun resmî 2026-2027 kaynak belgesi — bkz.
 * docs/contracts/2026_2027_OFFICIAL_CONTRACT_FULL_AUDIT.md). Bu, kurumun
 * ÖNCEKİ (2022, "nacar sözleşme.docx" kökenli, 26 madde ama FARKLI
 * numaralandırma/içerik) kanonik gövdesinin YERİNE geçer — kaynak belge
 * kurumun EN GÜNCEL resmî sözleşmesi olarak sunulmuştur. Hukuki metin
 * BİREBİR aktarılmıştır; yalnızca zaten noktalı boşluk (`...`) veya
 * checkbox (`☐`) olan alanlar `{{alan}}` haline getirilmiştir — hiçbir
 * madde YENİDEN YAZILMADI/YORUMLANMADI (bkz. yukarıdaki dosya başlığı ve
 * ACTIVE_TEMPLATE_RECOVERY_REPORT.md "sahibi onayı gereken maddeler").
 *
 * `renderTemplate` DÜZ `{{anahtar}}` değişimi yapar — `{{#each}}`/`{{#if}}`
 * YOKTUR (bkz. src/lib/contract-template-schema.ts). Bu yüzden:
 *   - Taksit satırları 12 SABİT `taksitN...` alanı (kullanılmayanlar boş),
 *   - Şube/ders-süresi/haftalık-sıklık/taahhüt-süresi checkbox SATIRLARI TEK
 *     bir düz-metin alanı (bkz. src/lib/contracts.ts formatCheckboxOptionsText),
 *   - KVKK/Foto-Video "ayrıca sunulmuştur" işaretleri TEK bir Evet/Hayır alanı
 *   olarak modellenir. Kaynağın KVKK Aydınlatma Metni ve Fotoğraf/Video Açık
 *   Rıza Formu bölümleri BİLEREK burada YOKTUR — kaynağın kendisi bunları
 *   "işbu sözleşmeden AYRI bir metin" olarak tanımlar (Madde 19/20); bu
 *   modülde `kvkk` ve `parent_social_media_consent` kind'leri altında AYRI
 *   şablonlar olarak tutulur (bkz. aşağıdaki DEFAULT_BODIES).
 */
export const STUDENT_ENROLLMENT_CONTRACT_BODY = `
<div style="text-align:center;">
  <h1>{{institutionName}}</h1>
  <p style="font-size:12px;color:#888;margin:0;">2026-2027 EĞİTİM DÖNEMİ · ÖĞRENCİ KAYIT SÖZLEŞMESİ</p>
  <h2>{{titleMain}}</h2>
  <p style="font-size:13px;color:#555;">{{titleSub}}</p>
</div>
<div style="text-align:right;font-size:11px;color:#777;border:1px solid #ccc;border-radius:8px;padding:6px 10px;margin:12px 0 16px;">
  <strong>Sözleşme No:</strong> {{reference}} &nbsp;·&nbsp; <strong>Versiyon:</strong> {{versionNumber}}
  &nbsp;·&nbsp; <strong>Tür:</strong> {{contractTypeLabel}}
  &nbsp;·&nbsp; <strong>Önceki Sözleşme:</strong> {{previousContractNumber}}
  &nbsp;·&nbsp; <strong>Şablon v{{templateVersion}}</strong> &nbsp;·&nbsp; {{generatedAtText}}
</div>

<h3>MADDE 1 – TARAFLAR</h3>
<p>İşbu sözleşme; {{institutionName}} (bundan sonra "Kurum" olarak anılacaktır) ile aşağıda bilgileri bulunan öğrenci ve/veya veli arasında düzenlenmiştir.</p>
<p><strong>Kurum Adresi:</strong> {{branchOptionsText}}</p>
<p><strong>Öğrenci/Kursiyer Adı Soyadı:</strong> {{studentName}}</p>
<p><strong>T.C. Kimlik No:</strong> {{studentNationalIdText}} &nbsp;&nbsp; <strong>Doğum Tarihi:</strong> {{studentBirthDateText}} &nbsp;&nbsp; <strong>Veli/Vasi Adı Soyadı:</strong> {{signatoryFullName}}</p>
<p><strong>Telefon:</strong> {{studentPhoneText}} &nbsp;&nbsp; <strong>E-posta:</strong> {{studentEmailText}}</p>
<p><strong>Adres:</strong> {{signatoryAddress}}</p>

<h3>MADDE 2 – SÖZLEŞMENİN KONUSU</h3>
<p>İşbu sözleşmenin konusu, öğrencinin Kurum tarafından sunulan müzik eğitimi hizmetlerinden yararlanmasına ilişkin tarafların hak ve yükümlülüklerinin belirlenmesidir. Eğitim hizmeti, Kurumun Millî Eğitim Bakanlığı tarafından onaylanmış programı, çalışma takvimi ve yürürlükteki ilgili mevzuat çerçevesinde yürütülür.</p>

<h3>MADDE 3 – BRANŞ VE EĞİTİM PROGRAMI</h3>
<p><strong>Öğrencinin kayıt olduğu branş:</strong> {{programmeName}}</p>
<p><strong>Ders süresi:</strong> {{lessonDurationOptionText}}</p>
<p><strong>Haftalık ders sıklığı:</strong> {{weeklyFrequencyOptionText}}</p>
<p><strong>Ders günü/saati:</strong> {{lessonScheduleText}}</p>
<p>Eğitim programının içeriği öğrencinin yaşına, seviyesine, branşına ve Kurumun eğitim programına göre planlanır. Ders gün ve saatlerinin belirlenmesinde öğrencinin/velinin tercihleri mümkün olduğu ölçüde dikkate alınır. Öğretmen, derslik, Kurum çalışma programı ve eğitim planlaması nedeniyle gerekli durumlarda makul değişiklik yapılabilir.</p>

<h3>MADDE 4 – EĞİTİM ÜCRETİ VE ÖDEME</h3>
<p><strong>Aylık ücret:</strong> {{unitFeeAmountText}} TL &nbsp;&nbsp; <strong>KDV:</strong> {{vatStatusText}} &nbsp;&nbsp; <strong>Toplam sözleşme bedeli:</strong> {{totalContractAmountText}} TL</p>
<p>Ödemelerin sözleşmede belirtilen tarihlerde yapılması esastır. Ödemeler nakit, kredi kartı veya Kurumun bildirdiği banka hesabına yapılabilir. Kurum tarafından alınan ödemeler karşılığında yürürlükteki mevzuata uygun belge düzenlenir. Kurumumuzda kayıt sırasında bildirilen ödeme gününde ödemeler her ay düzenli olarak alınır.</p>
<ul>
  <li><strong>Kredi kartı ile yapılan ödemeler:</strong> Her ayın 1–5'i arasında (iki gün dahil) tamamlanmalıdır.</li>
  <li><strong>Nakit / Havale / EFT ile yapılan ödemeler:</strong> Her ayın 1–15'i arasında (iki gün dahil) tamamlanmalıdır.</li>
</ul>
<p>Bu sözleşmede seçilen ödeme yöntemi için geçerli kural: <strong>{{paymentDueRuleText}}</strong></p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;" border="1" cellpadding="4">
<thead><tr><th>HİZMET BEDELİ</th><th>Taksit</th><th>Tarih</th><th>Tutar</th><th>Ödeme Türü</th></tr></thead>
<tbody>
<tr><td>{{taksit1Aciklama}}</td><td>1</td><td>{{taksit1Tarih}}</td><td>{{taksit1Tutar}} TL</td><td>{{taksit1Yontem}}</td></tr>
<tr><td>{{taksit2Aciklama}}</td><td>2</td><td>{{taksit2Tarih}}</td><td>{{taksit2Tutar}} TL</td><td>{{taksit2Yontem}}</td></tr>
<tr><td>{{taksit3Aciklama}}</td><td>3</td><td>{{taksit3Tarih}}</td><td>{{taksit3Tutar}} TL</td><td>{{taksit3Yontem}}</td></tr>
<tr><td>{{taksit4Aciklama}}</td><td>4</td><td>{{taksit4Tarih}}</td><td>{{taksit4Tutar}} TL</td><td>{{taksit4Yontem}}</td></tr>
<tr><td>{{taksit5Aciklama}}</td><td>5</td><td>{{taksit5Tarih}}</td><td>{{taksit5Tutar}} TL</td><td>{{taksit5Yontem}}</td></tr>
<tr><td>{{taksit6Aciklama}}</td><td>6</td><td>{{taksit6Tarih}}</td><td>{{taksit6Tutar}} TL</td><td>{{taksit6Yontem}}</td></tr>
<tr><td>{{taksit7Aciklama}}</td><td>7</td><td>{{taksit7Tarih}}</td><td>{{taksit7Tutar}} TL</td><td>{{taksit7Yontem}}</td></tr>
<tr><td>{{taksit8Aciklama}}</td><td>8</td><td>{{taksit8Tarih}}</td><td>{{taksit8Tutar}} TL</td><td>{{taksit8Yontem}}</td></tr>
<tr><td>{{taksit9Aciklama}}</td><td>9</td><td>{{taksit9Tarih}}</td><td>{{taksit9Tutar}} TL</td><td>{{taksit9Yontem}}</td></tr>
<tr><td>{{taksit10Aciklama}}</td><td>10</td><td>{{taksit10Tarih}}</td><td>{{taksit10Tutar}} TL</td><td>{{taksit10Yontem}}</td></tr>
<tr><td>{{taksit11Aciklama}}</td><td>11</td><td>{{taksit11Tarih}}</td><td>{{taksit11Tutar}} TL</td><td>{{taksit11Yontem}}</td></tr>
<tr><td>{{taksit12Aciklama}}</td><td>12</td><td>{{taksit12Tarih}}</td><td>{{taksit12Tutar}} TL</td><td>{{taksit12Yontem}}</td></tr>
</tbody>
</table>
<p><em>Kaparo/depozito (varsa, yukarıdaki toplama dahildir): {{depositAmountText}} TL</em></p>

<h3>MADDE 5 – SABİT FİYAT GARANTİSİ VE DEVAM KOŞULU</h3>
<p>Kurum tarafından 2026-2027 eğitim dönemi kapsamında sunulan "Sabit Fiyat Garantisi", öğrencinin kayıt sırasında belirlediği eğitim süresi boyunca Kurumda eğitimine devam etmesi ve sözleşmede belirtilen ödeme yükümlülüklerini zamanında yerine getirmesi koşuluna bağlı bir fiyat avantajıdır. Kurumumuzun ücretlendirme sistemi yıllık eğitim planına göre oluşturulmuştur. Eğitim döneminin tamamlanmasından önce kaydın dondurulması, eğitimine ara verilmesi veya kurumdan ayrılma durumunda öğrencinin o tarihe kadar almış olduğu toplam ders sayısı hesaplanır. Yapılan hesaplama sonucunda fazla ders alınmış ise fark ücreti tahsil edilir; eksik ders alınmış ise eksik kalan dersler kurum tarafından planlanarak tamamlanır.</p>
<p><strong>Öğrencinin seçtiği taahhüt süresi:</strong> {{commitmentDurationOptionText}}</p>
<p>Öğrencinin seçmiş olduğu süre boyunca kayıtlı olduğu programa devam etmesi ve ödeme yükümlülüklerini yerine getirmesi halinde, kayıt tarihinde belirlenen eğitim ücreti taahhüt edilen süre boyunca sabit tutulur ve Kurum tarafından fiyat artışı uygulanmaz.</p>
<p>Öğrencinin kendi isteğiyle eğitimine ara vermesi, kaydını sonlandırması veya belirlenen devam süresini tamamlamadan Kurumdan ayrılması halinde Sabit Fiyat Garantisi sona erer. Öğrencinin daha sonra Kuruma yeniden dönmek istemesi halinde, yeniden kayıt tarihinde Kurum tarafından uygulanmakta olan güncel eğitim ücreti üzerinden kayıt işlemi yapılır; önceki sabit fiyat veya erken kayıt fiyatı yeniden dönüşte uygulanmaz.</p>
<p>Hastalık, şehir değişikliği, tayin ve benzeri zorunlu durumlarda kayıt iptali, kayıt dondurma ve varsa ücret iadesi bakımından yürürlükteki mevzuat hükümleri uygulanır. Öğrencinin/velinin kanundan doğan hakları saklıdır.</p>

<h3>MADDE 6 – DERSLERİN PLANLANMASI</h3>
<p>Kurumumuzda eğitim programı haftalık sabit ders sistemi ile yürütülmektedir. Dersler, öğrencinin kayıtlı olduğu program ve Kurumun eğitim takvimi doğrultusunda belirlenen sabit gün ve saatte gerçekleştirilir. Öğrencinin/velinin kişisel tercihleri, özel durumları veya program değişiklikleri nedeniyle ders gün ve saatinin değiştirilmesi, Kurumun ve öğretmenin uygunluğuna bağlıdır ve değişiklik yapılması garanti edilemez.</p>
<p>Ücretlendirme, ilgili ay içerisinde gerçekleştirilen ders sayısına göre değil, yıllık eğitim planı esas alınarak belirlenir. Bu nedenle resmî tatiller ve takvim yapısı doğrultusunda bazı aylarda 3, bazı aylarda 4, bazı aylarda ise 5 ders yapılabilmektedir. Aylara göre oluşan ders sayısı farklılıkları yıllık eğitim planı içerisinde dengelendiğinden aylık ücret değişmez. Bir ayda diğer aylara göre daha fazla veya daha az ders yapılması, öğrencinin eksik veya fazla ders aldığı anlamına gelmez ve bu farklılıklar telafi, ücret iadesi veya sonraki aya ders aktarımı hakkı doğurmaz.</p>
<p>Resmî tatiller, bayramlar ve Kurumun yıllık eğitim takvimi kapsamında oluşan ders farklılıkları eğitim sisteminin doğal bir parçasıdır ve telafi kapsamında değerlendirilmez.</p>

<h3>MADDE 7 – DEVAMSIZLIK</h3>
<p>Öğrencinin kendi isteğiyle veya kişisel nedenlerle derse katılmaması halinde, ilgili dersin ücreti kural olarak iade edilmez ve aylık ücretten düşülmez. Önceden haber verilmeksizin derse katılmama halinde Kurumun telafi yükümlülüğü bulunmaz. Kurum tarafından kabul edilen belgelenebilir zorunlu mazeretler bakımından Madde 8 hükümleri uygulanabilir.</p>

<h3>MADDE 8 – TELAFİ DERSLERİ</h3>
<p>Özel derslerde Kurum veya öğretmen kaynaklı ders iptalleri Kurum tarafından telafi edilir veya öğrencinin eğitim sürecinin aksamaması amacıyla uygun alternatif bir ders planlaması yapılır. Öğrencinin raporla belgelendirilen sağlık sorunları veya önceden Kuruma bildirilmiş cenaze, mezuniyet, resmî görev ve benzeri zorunlu mazeretleri bulunması halinde, Kurumun ve öğretmenin program uygunluğu doğrultusunda telafi dersi planlanabilir. Her öğrenci için 2026-2027 eğitim yılının tamamında (güz ve yaz dönemleri ayrı ayrı değil, toplamda) en fazla iki (2) telafi hakkı bulunmaktadır. Öğrencinin tatil, seyahat, doğum günü, sosyal etkinlik, okul etkinliği, kişisel tercih ve benzeri nedenlerle derse katılmaması telafi hakkı doğurmaz. Aynı gün içerisinde bildirilen ders iptalleri, zorunlu ve belgelendirilebilir bir mazeret bulunmadığı sürece, işlenmiş ders olarak kabul edilir ve telafi hakkı verilmez. Resmî tatiller, bayramlar ve Kurumun yıllık eğitim planı kapsamında oluşan ders farklılıkları telafi kapsamında değerlendirilmez. Telafi hakkı, telafiye konu olan dersin planlanan/orijinal tarihinden itibaren 30 (otuz) takvim günü içinde kullanılmalıdır. Bu süre içinde kullanılmayan telafi hakkı geçerliliğini kaybeder. Telafi dersinin günü ve saati, yalnızca öğretmenin ve Kurumun mevcut program ve çalışma uygunluğuna göre belirlenir; veli veya öğrencinin talep ettiği gün ve saate göre telafi planlaması yapılması garanti edilemez. Planlanan telafi dersine öğrencinin katılım sağlamaması halinde, aynı ders için yeniden telafi hakkı doğmaz. Grup derslerinde telafi uygulanıp uygulanmayacağı, grubun niteliği, dersin işleyişi ve Kurumun programı doğrultusunda Kurum tarafından belirlenir.</p>

<h3>MADDE 9 – RESMÎ TATİLLER VE KURUMUN KAPALI OLDUĞU GÜNLER</h3>
<p>Kurum, Millî Eğitim Bakanlığı mevzuatı ve Kurumun onaylı çalışma takvimi doğrultusunda resmî tatil ve Kurumun kapalı olduğu günlerde eğitim faaliyeti yürütmez. Özel Öğretim Kurumları muhtelif kurslar kapsamında olan kurumumuz, yarıyıl (sömestr) ve yaz tatilinde açık ve eğitimine devam etmektedir. Bu süre içinde derslere gelmeyecek olan kursiyerlerin gelmeyeceği süreyi belirten dilekçeyi kuruma vermesi zorunludur; aksi takdirde devam edeceği kabul olunur. Kursiyerin derslerine ara vermesi hâlinde, kayıtlı olduğu gün ve saatin korunabilmesi amacıyla aylık ödemelerin devam etmesi gerekmektedir; ödemelerin devam etmesi durumunda kursiyerin mevcut kayıt koşulları, ders günü ve saati ile mevcut indirimleri korunur. Ara verilen dönemde ödemenin durdurulması veya kayıt ücretinin ödenmemesi hâlinde mevcut indirim ve özel fiyat koşulları korunmaz. Ödemelerin devam ettiği ara verme döneminde kursiyerin katılmadığı dersler, ücretlendirilmiş ders olarak değerlendirilir ve kursiyerin eğitime yeniden başlamasıyla birlikte Kurum tarafından, öğretmen ve Kurumun program uygunluğu doğrultusunda telafi edilir.</p>

<h3>MADDE 10 – ÖĞRETMEN KAYNAKLI DERS İPTALLERİ</h3>
<p>Öğretmenin hastalık, izin, görevlendirme veya başka bir zorunlu nedenle derse katılamaması halinde Kurum, öğrencinin eğitim hakkını koruyacak şekilde uygun başka bir öğretmen veya uygun başka bir ders zamanı planlamaya çalışır. Kurum tarafından gerçekleştirilemeyen dersler için ilgili mevzuat ve işbu sözleşme hükümleri doğrultusunda telafi veya ücret mahsuplaşması yapılır.</p>

<h3>MADDE 11 – EĞİTİM DÖNEMİ VE KAYIT SÜRESİ</h3>
<p style="text-align:center;"><strong>EĞİTİM BAŞLANGIÇ TARİHİ:</strong> {{enrollmentStartDateText}} &nbsp;&nbsp;&nbsp; <strong>EĞİTİM BİTİŞ TARİHİ:</strong> {{enrollmentEndDateText}}</p>
<p>Sözleşme yukarıda belirtilen eğitim dönemi için geçerlidir. Yeni eğitim döneminde devam etmek isteyen öğrenciler için yeni dönem kayıt işlemleri ayrıca yapılır.</p>
<p>{{renewalNoticeText}}</p>

<h3>MADDE 12 – KAYIT İPTALİ VE ÜCRET İADESİ</h3>
<p>Öğrenci/veli, kayıt iptali talebini yazılı olarak Kuruma bildirir. Kayıt iptali ve ücret iadesinde yürürlükte bulunan Millî Eğitim Bakanlığı mevzuatı ve ilgili diğer mevzuat hükümleri uygulanır. Ders saati ücreti esasına göre ücret belirlenen kurumlarda ayrılma halinde ücret iadesi, ilgili mevzuatta belirtilen hesaplama yöntemi üzerinden yapılır. İşbu sözleşmedeki hiçbir hüküm öğrencinin veya velinin kanundan doğan tüketici haklarını ortadan kaldıracak veya sınırlandıracak şekilde yorumlanamaz.</p>

<h3>MADDE 13 – ÖDEME GECİKMESİ</h3>
<p>Ödemelerin sözleşmede belirtilen tarihlerde yapılması esastır. Ödeme tarihinde ödeme yapılmaması halinde Kurum, veli/öğrenciye ödeme için makul bir süre tanıyabilir. Ödeme yükümlülüğünün yerine getirilmemesi halinde Kurum, yürürlükteki mevzuata uygun olarak eğitim hizmetini geçici olarak durdurabilir ve varsa muaccel alacakları için yasal yollara başvurabilir.</p>

<h3>MADDE 14 – KAYIT DONDURMA</h3>
<p>Öğrenci/veli, eğitim sürecinde zorunlu veya önemli bir nedenle geçici olarak eğitime ara vermek istemesi halinde Kuruma 15 gün önce yazılı olarak başvurabilir. Kayıt dondurma talepleri Kurumun eğitim programı, öğretmen planlaması ve yürürlükteki mevzuat dikkate alınarak değerlendirilir. Kayıt dondurma işlemi ancak Kurum tarafından yazılı olarak onaylandığında geçerli olur. Sabit Fiyat Garantisi bakımından Madde 5 hükümleri ayrıca uygulanır.</p>

<h3>MADDE 15 – KURUM İÇİ İLETİŞİM</h3>
<p>Öğrenci ve veli; ders programı, telafi, ödeme, kayıt, devam durumu ve diğer idari işlemler için öncelikle Kurum yönetimiyle iletişim kurar. Öğretmenlerle ders dışında iletişim kurulması gerektiğinde Kurumun belirlediği iletişim kanallarının kullanılması esastır. Bu madde öğrencinin eğitim hakkını, acil iletişim ihtiyacını veya kanundan doğan haklarını ortadan kaldıracak şekilde yorumlanamaz.</p>

<h3>MADDE 16 – KURUM DIŞINDA ÖZEL DERS</h3>
<p>Öğrencinin eğitim sürecinin Kurum tarafından düzenli şekilde takip edilebilmesi amacıyla, Kurumun bilgisi ve onayı dışında Kurum öğretmenleriyle Kurum öğrencileri arasında Kurum dışı özel ders organizasyonu yapılmaması esastır. Bu hüküm, kanunen korunan kişisel iletişim veya hakları sınırlandıracak şekilde yorumlanamaz.</p>

<h3>MADDE 17 – KURUM EŞYASI VE MÜZİK ALETLERİ</h3>
<p>Öğrencinin kusuru veya ihmali nedeniyle Kurum demirbaşlarına, müzik aletlerine veya diğer eşyalara zarar verilmesi halinde, zarar gören eşyanın gerçek ve belgelenebilir onarım/değişim bedeli, yürürlükteki mevzuat çerçevesinde öğrenciden/veliden talep edilebilir. Zarar miktarı keyfî şekilde belirlenemez; gerektiğinde fatura, servis kaydı veya benzeri belgelerle tespit edilir.</p>

<h3>MADDE 18 – KONSER VE ETKİNLİKLER</h3>
<p>Kurum tarafından düzenlenen konser, gösteri, sınav, prova ve benzeri etkinliklere katılım, etkinliğin niteliğine göre ayrıca planlanır. Konser veya etkinlik kapsamında Kurum tarafından önceden açıkça bildirilen salon, kostüm, ulaşım, çekim veya benzeri giderler varsa bunlar ayrıca ve açık şekilde veli/öğrenciye bildirilir. Öğrencinin konser veya etkinlikte yer alması, öğretmeninin ve Kurumun eğitimsel değerlendirmesi doğrultusunda belirlenebilir.</p>

<h3>MADDE 19 – FOTOĞRAF VE VİDEO ÇEKİMLERİ</h3>
<p>Öğrencilerin fotoğraf ve video görüntülerinin reklam, sosyal medya, internet sitesi, broşür veya diğer tanıtım faaliyetlerinde kullanılması için gerekli durumlarda ayrıca ve mevzuata uygun şekilde açık rıza alınır. Fotoğraf/video açık rızası, eğitim hizmetinden yararlanmanın zorunlu şartı olarak ileri sürülemez. Fotoğraf ve video kullanımıyla ilgili açık rıza beyanı işbu sözleşmeden AYRI bir metin olarak düzenlenir ("Fotoğraf / Video Açık Rıza Formu"). <strong>Fotoğraf/Video Açık Rıza Metni ayrıca sunulmuştur:</strong> {{photoVideoConsentFormCheckboxText}}</p>

<h3>MADDE 20 – KİŞİSEL VERİLER</h3>
<p>Kurum tarafından öğrenci ve veliye ait kişisel veriler, 6698 sayılı Kişisel Verilerin Korunması Kanunu ve ilgili mevzuata uygun şekilde işlenir. Kişisel verilerin hangi amaçlarla işlendiği, hukuki sebepleri, aktarılabileceği kişi ve kuruluşlar, saklama süreleri ve ilgili kişinin kanuni hakları hakkında ayrıca KVKK Aydınlatma Metni sunulur. Aydınlatma metninin okunması, açık rıza verilmesi anlamına gelmez. Açık rıza gereken veri işleme faaliyetleri bakımından ayrıca açık rıza alınır. <strong>KVKK Aydınlatma Metni ayrıca teslim edilmiş/bilgilendirme yapılmıştır:</strong> {{kvkkNoticeDeliveredCheckboxText}}</p>

<h3>MADDE 21 – EĞİTİM MATERYALLERİ VE DİĞER GİDERLER</h3>
<p>Eğitim ücretine dahil olmayan kitap, nota, sınav, sertifika, kostüm, etkinlik veya benzeri giderler bulunması halinde ilgili gider ve tutar öğrenci/veli tarafından önceden bilgilendirilir.</p>

<h3>MADDE 22 – KURUMUN HAK VE YÜKÜMLÜLÜKLERİ</h3>
<p>Kurum, eğitim hizmetini yürürlükteki mevzuata, Kurumun onaylı programına ve işbu sözleşmeye uygun şekilde sunmayı taahhüt eder. Kurum, öğrencinin eğitim sürecinin sağlıklı yürütülmesi için öğretmen, derslik ve ders programında eğitimsel veya idari zorunluluklardan kaynaklanan makul değişiklikler yapabilir.</p>

<h3>MADDE 23 – VELİNİN / ÖĞRENCİNİN YÜKÜMLÜLÜKLERİ</h3>
<p>Öğrenci/veli; derslere düzenli katılmayı, ödemeleri zamanında yapmayı, Kurumun eğitim düzenine uymayı, Kurum çalışanlarına ve diğer öğrencilere saygılı davranmayı, adres ve iletişim bilgilerindeki değişiklikleri Kuruma bildirmeyi ve Kurum tarafından bildirilen eğitim ve güvenlik kurallarına uymayı kabul eder.</p>

<h3>MADDE 24 – TEBLİGAT VE İLETİŞİM</h3>
<p>Öğrenci/veli tarafından Kuruma bildirilen telefon, e-posta ve adres bilgilerinin güncel tutulması öğrencinin/velinin sorumluluğundadır. Kurum tarafından yapılan bilgilendirmeler, kanunen geçerli tebligat yerine geçmediği sürece WhatsApp, SMS, e-posta veya benzeri iletişim kanalları üzerinden yapılabilir. Kanuni tebligatlarda ilgili mevzuat hükümleri uygulanır.</p>

<h3>MADDE 25 – UYUŞMAZLIKLAR</h3>
<p>İşbu sözleşmeden doğabilecek uyuşmazlıklarda öncelikle taraflar arasında çözüm aranır. Uyuşmazlığın çözülememesi halinde tüketicinin kanundan doğan başvuru hakları saklıdır. Tüketici hakem heyeti, tüketici mahkemesi ve diğer yetkili mercilerin görev ve yetkileri yürürlükteki mevzuata göre belirlenir.</p>

<h3>MADDE 26 – SÖZLEŞMENİN YÜRÜRLÜĞÜ</h3>
<p>İşbu sözleşme taraflarca okunarak, içeriği anlaşılmış ve tarafların serbest iradeleriyle imzalanmıştır. Sözleşmede hüküm bulunmayan hallerde yürürlükte bulunan Millî Eğitim Bakanlığı mevzuatı, tüketicinin korunmasına ilişkin mevzuat, Türk Borçlar Kanunu ve diğer ilgili mevzuat hükümleri uygulanır. Kanunun emredici hükümlerine aykırı sözleşme hükümleri uygulanmaz.</p>
<p>İşbu sözleşme toplam 26 maddeden oluşmakta olup iki nüsha olarak düzenlenmiş ve taraflarca imzalanmıştır.</p>

<h3>KAYIT VE İMZA BİLGİLERİ</h3>
<p><strong>Başvuru Tarihi:</strong> {{generatedAtText}}</p>
<p><strong>Öğrenci/Veli Ad Soyad:</strong> {{signatoryFullName}}<br/><strong>T.C. Kimlik No:</strong> {{signatoryNationalId}}<br/><strong>Adres:</strong> {{signatoryAddress}}<br/><strong>Telefon:</strong> {{studentPhoneText}} &nbsp;&nbsp; <strong>E-posta:</strong> {{studentEmailText}}</p>
<p><strong>Bu belge tek başına imzalı bir sözleşme değildir</strong> — hukuki geçerlilik için ıslak imza gereklidir.</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;" border="1" cellpadding="6">
<thead><tr><th>KURUM</th><th>KURSİYER / VELİ</th></tr></thead>
<tbody>
<tr>
  <td>{{institutionName}}<br/><br/>Yetkili: ....................................<br/>Kaşe / İmza:</td>
  <td>Ad Soyad: {{signatoryFullName}}<br/><br/>İmza:</td>
</tr>
<tr>
  <td>Tarih: .... / .... / 20....</td>
  <td>Tarih: .... / .... / 20....</td>
</tr>
</tbody>
</table>
`;

/**
 * 2026-2027 kaynağı — KVKK Aydınlatma Metni, işbu kayıt sözleşmesinden
 * BİLEREK AYRI bir belge (kaynak Madde 20: "ayrıca KVKK Aydınlatma Metni
 * sunulur"). İçerik kaynaktan BİREBİR alınmıştır. Bu şablon henüz OTOMATİK
 * üretim akışına (registration/contract-creation) BAĞLANMADI — bkz.
 * docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md
 * (PORTAL-CONTRACT-001 komşusu, ayrı P1 kalemi).
 */
const KVKK_INFO_NOTICE_BODY = `
<div style="text-align:center;"><h1>{{institutionName}}</h1><h2>KVKK AYDINLATMA METNİ</h2></div>
<p>6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında, veri sorumlusu sıfatıyla {{institutionName}} tarafından öğrenci ve veli/vasinin kişisel verilerinin işlenmesi hakkında aşağıdaki bilgilendirme yapılmaktadır.</p>
<p><strong>1. Veri Sorumlusu:</strong> {{institutionName}} — Adres: {{institutionAddress}}</p>
<p><strong>2. İşlenebilecek Kişisel Veri Kategorileri:</strong> Kayıt ve eğitim süreçlerine bağlı olarak kimlik bilgileri, iletişim bilgileri, öğrenciye ilişkin eğitim/kurs bilgileri, ders ve devam bilgileri, ödeme/fatura bilgileri, veli bilgileri işlenebilir. Fotoğraf ve video görüntülerinin tanıtım amacıyla kullanılması AYRICA açık rıza alınması gereken bir faaliyettir.</p>
<p><strong>3. İşlenme Amaçları:</strong> Öğrenci kaydının oluşturulması ve yürütülmesi, eğitim hizmetinin planlanması ve sunulması, ders programlarının oluşturulması, öğrenci/veli ile iletişim kurulması, ödeme ve muhasebe işlemlerinin yürütülmesi, mevzuattan kaynaklanan yükümlülüklerin yerine getirilmesi, kurum güvenliğinin sağlanması ve hukuki süreçlerin yürütülmesi.</p>
<p><strong>4. Hukuki Sebepler:</strong> KVKK'nın 5. maddesinde düzenlenen hukuki sebeplerden somut işleme faaliyetine uygun olanlar (sözleşmenin kurulması/ifası, hukuki yükümlülük, bir hakkın tesisi/korunması, kanunda öngörülme, meşru menfaat). Açık rıza gerektiren bir faaliyet varsa ayrıca açık rıza alınır — aydınlatma metninin okunması/teslim alınması açık rıza anlamına GELMEZ.</p>
<p><strong>5. Aktarım:</strong> Kişisel veriler yalnızca somut işleme faaliyetinin gerektirdiği ölçüde; yetkili kamu kurum ve kuruluşlarına, kanunen yetkili kişilere, muhasebe/finans hizmet sağlayıcılarına ve Kurumun idari faaliyetleri için gerekli hizmet sağlayıcılara aktarılabilir.</p>
<p><strong>6. Saklama Süresi:</strong> İlgili mevzuatta öngörülen süre ve işleme amacı için gerekli süre ile sınırlıdır.</p>
<p><strong>7. İlgili Kişinin Hakları:</strong> KVKK'nın 11. maddesi kapsamındaki haklar için veri sorumlusuna başvurulabilir. Başvuru/iletişim: {{institutionAddress}}</p>
<p><strong>8. Aydınlatma Beyanı:</strong> Aydınlatma Metnini okudum ve kişisel verilerimin hangi amaçlarla ve hangi hukuki sebeplerle işlenebileceği konusunda bilgilendirildim. Bu imza, kişisel verilerimin işlenmesine yönelik genel bir açık rıza beyanı DEĞİLDİR.</p>
<p>Kursiyer/Veli Ad Soyad: {{studentName}} &nbsp;&nbsp; Tarih: {{date}} &nbsp;&nbsp; İmza: ....................................</p>`;

/**
 * 2026-2027 kaynağı — Fotoğraf/Video Açık Rıza Formu, KVKK Aydınlatma
 * Metninden VE kayıt sözleşmesinden AYRI (kaynak: "bu form ... KVKK
 * Aydınlatma Metninden ayrı olarak alınması amacıyla düzenlenmiştir").
 * Kaynağın 5 KANALI ayrı ayrı değerlendirilir — bkz. src/lib/types.ts
 * SocialMediaScope (website/instagram/print_materials/digital_ads/
 * in_house_board). `{{scopes}}` düz metin olarak (renderer #each
 * DESTEKLEMEZ) çağıran taraf (bkz. tools.ts) tarafından ☑/☐ satırı olarak
 * biçimlendirilip geçirilir.
 */
const PHOTO_VIDEO_CONSENT_BODY = `
<div style="text-align:center;"><h1>{{institutionName}}</h1><h2>FOTOĞRAF / VİDEO AÇIK RIZA FORMU</h2></div>
<p>Bu form, öğrencinin fotoğraf ve/veya video görüntülerinin tanıtım ve iletişim faaliyetlerinde kullanılmasına ilişkin açık rıza beyanının, KVKK Aydınlatma Metninden ayrı olarak alınması amacıyla düzenlenmiştir.</p>
<p><strong>Öğrenci Adı Soyadı:</strong> {{studentName}} &nbsp;&nbsp; <strong>Veli/Vasi Adı Soyadı:</strong> {{parentName}} &nbsp;&nbsp; <strong>Tarih:</strong> {{date}}</p>
<p>Kurum tarafından eğitim, etkinlik, konser, gösteri veya benzeri faaliyetler sırasında çekilebilecek öğrencinin fotoğraf ve/veya video görüntülerinin aşağıda seçtiğim tanıtım kanallarında kullanılmasına, bu kapsamla sınırlı olmak üzere açık rıza veriyorum. Aşağıdaki seçeneklerden her biri ayrı ayrı değerlendirilir:</p>
<p>{{scopes}}</p>
<p>Fotoğraf/video kullanımına ilişkin açık rıza vermenin eğitim hizmetinden yararlanmanın şartı olmadığını biliyorum. Açık rızamı geleceğe etkili olmak üzere geri çekebileceğimi ve geri çekme talebimi Kuruma bildirebileceğimi biliyorum.</p>
<p>{{consentGrantedMark}} Yukarıdaki seçimlerim doğrultusunda açık rıza veriyorum. &nbsp;&nbsp; {{consentDeniedMark}} Fotoğraf/video kullanımına açık rıza vermiyorum.</p>
<p>Kursiyer/Veli Ad Soyad: {{parentName}} &nbsp;&nbsp; İmza: .................................... &nbsp;&nbsp; Tarih: {{date}}</p>
<p style="font-size:12px;color:#666;">18 yaşından küçük öğrenciler için form, öğrencinin velisi/vasisi tarafından imzalanır; veli/vasi, öğrenciyi temsile ilişkin yetkisinin bulunduğunu kabul eder.</p>`;

const DEFAULT_BODIES: Partial<Record<DocumentTemplateKind, string>> = {
  student_enrollment_contract: STUDENT_ENROLLMENT_CONTRACT_BODY,
  parent_social_media_consent: PHOTO_VIDEO_CONSENT_BODY,
  kvkk: KVKK_INFO_NOTICE_BODY,
  trial_form: `<h1>Deneme Dersi Formu</h1><p>{{name}} · {{phone}} · {{date}} · {{reference}}</p>`,
};

/**
 * P0 (2026-09-05) — KURUMSAL KAYNAK METNİNE DOĞRUDAN ERİŞİM.
 *
 * `DEFAULT_BODIES` zaten 2026-2027 kayıt sözleşmesi kaynağının (ana metin +
 * KVKK Aydınlatma Metni + Fotoğraf/Video Açık Rıza Formu) kod içindeki
 * kanonik karşılığıdır. Önceden bu metinlere yalnızca "yeni tenant için
 * varsayılan şablon üret" ve "taslak oluştur" yollarından ulaşılabiliyordu;
 * yani kurumda eski/kısa bir `kvkk` şablonu aktif kalmışsa sözleşme çıktısı,
 * bir yönetici AYRI bir taslağı ETKİNLEŞTİRENE kadar hukuken zayıf kalıyordu.
 * Birleşik sözleşme akışının (bkz. contract-annexes.ts) bu kaynağa doğrudan
 * düşebilmesi için okunur bir erişim noktası. Metin BURADA DEĞİŞTİRİLMEZ.
 */
export function canonicalTemplateBody(kind: DocumentTemplateKind): string | undefined {
  return DEFAULT_BODIES[kind];
}

export async function ensureDefaultTemplates(tenantId: string): Promise<DocumentTemplate[]> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const existing = await prisma.documentTemplate.findMany({ where: { tenantId } });
    if (existing.length > 0) {
      return existing.map(mapTplDb);
    }
  } else {
    const all = await loadTpl();
    const mine = all.filter((t) => t.tenantId === tenantId);
    if (mine.length > 0) return mine.map(publicTpl);
  }

  const now = new Date().toISOString();
  const created: StoredTpl[] = (
    Object.entries(DEFAULT_BODIES) as [DocumentTemplateKind, string][]
  ).map(([kind, bodyHtml]) => ({
    id: uid("dtpl"),
    tenantId,
    kind,
    name: documentKindLabel(kind),
    bodyHtml,
    active: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));

  if (isDbMode) {
    const { prisma } = await import("../db");
    for (const t of created) {
      await prisma.documentTemplate.create({
        data: {
          id: t.id,
          tenantId,
          kind: t.kind,
          name: t.name,
          bodyHtml: t.bodyHtml,
          active: true,
          version: 1,
        },
      });
    }
  } else {
    const all = await loadTpl();
    await saveTpl([...all, ...created]);
  }
  return created.map(publicTpl);
}

function publicTpl(t: StoredTpl): DocumentTemplate {
  const { tenantId: _x, ...rest } = t;
  void _x;
  return rest;
}

function mapTplDb(t: {
  id: string;
  kind: string;
  name: string;
  bodyHtml: string;
  active: boolean;
  createdById?: string | null;
  version?: number | null;
  createdAt: Date;
  updatedAt: Date;
  sourceFileData?: string | null;
  sourceFileName?: string | null;
  sourceMimeType?: string | null;
  sourceUploadedAt?: Date | null;
  sourceUploadedById?: string | null;
}): DocumentTemplate {
  return {
    id: t.id,
    kind: t.kind as DocumentTemplateKind,
    name: t.name,
    bodyHtml: t.bodyHtml,
    active: t.active,
    createdById: t.createdById ?? undefined,
    version: t.version ?? 1,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    sourceFileData: t.sourceFileData ?? undefined,
    sourceFileName: t.sourceFileName ?? undefined,
    sourceMimeType: t.sourceMimeType ?? undefined,
    sourceUploadedAt: t.sourceUploadedAt ? t.sourceUploadedAt.toISOString() : undefined,
    sourceUploadedById: t.sourceUploadedById ?? undefined,
  };
}

export type CreateTemplateInput = {
  tenantId: string;
  kind: DocumentTemplateKind;
  name: string;
  bodyHtml: string;
  createdById: string;
  /** Faz 6 — varsayılan `true` (mevcut davranış). "Kurumsal kaynaktan taslak oluştur" akışı bilinçli olarak `false` geçer: yeni şablon derhal aktif OLMAZ, yönetici açıkça etkinleştirmelidir. */
  active?: boolean;
  /** P0 (2026-08-30) — DOCX yükleme akışı orijinal dosyayı burada taşır; bkz. types.ts DocumentTemplate. */
  sourceFileData?: string;
  sourceFileName?: string;
  sourceMimeType?: string;
};

/** Yönetici tarafından yeni şablon — bodyHtml sanitize edilerek yazılır (XSS savunması). */
export async function createTemplate(input: CreateTemplateInput): Promise<DocumentTemplate> {
  const now = new Date().toISOString();
  const safeBody = sanitizeTemplateHtml(input.bodyHtml);
  const active = input.active ?? true;
  const hasSourceFile = !!input.sourceFileData;
  const row: StoredTpl = {
    id: uid("dtpl"),
    tenantId: input.tenantId,
    kind: input.kind,
    name: input.name,
    bodyHtml: safeBody,
    active,
    createdById: input.createdById,
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceFileData: input.sourceFileData,
    sourceFileName: input.sourceFileName,
    sourceMimeType: input.sourceMimeType,
    sourceUploadedAt: hasSourceFile ? now : undefined,
    sourceUploadedById: hasSourceFile ? input.createdById : undefined,
  };
  if (isDbMode) {
    const { prisma } = await import("../db");
    await prisma.documentTemplate.create({
      data: {
        id: row.id,
        tenantId: row.tenantId,
        kind: row.kind,
        name: row.name,
        bodyHtml: row.bodyHtml,
        active,
        createdById: input.createdById,
        version: 1,
        sourceFileData: row.sourceFileData,
        sourceFileName: row.sourceFileName,
        sourceMimeType: row.sourceMimeType,
        sourceUploadedAt: hasSourceFile ? new Date(now) : undefined,
        sourceUploadedById: row.sourceUploadedById,
      },
    });
  } else {
    const all = await loadTpl();
    await saveTpl([...all, row]);
  }
  return publicTpl(row);
}

/**
 * Faz 6 — "Sözleşme Şablonları" ekranındaki güvenli, YIKICI OLMAYAN kurtarma
 * yolu: kurumsal kaynak gövdesinden (kod içindeki kanonik varsayılan, hukuki
 * metin ASLA burada değiştirilmez) YENİ bir taslak oluşturur — `active:false`
 * ile, yönetici AÇIKÇA etkinleştirmeden formal sözleşme üretiminde
 * kullanılmaz. Mevcut aktif şablona hiç dokunulmaz.
 */
export async function createContractTemplateDraftFromCanonicalSource(
  tenantId: string,
  createdById: string,
  /**
   * P0 (2026-09-05) — artık yalnız kayıt sözleşmesi için değil: KVKK
   * Aydınlatma Metni ve Fotoğraf/Video Açık Rıza Formu şablonları da AYNI
   * kurumsal kaynaktan (DEFAULT_BODIES) taslak olarak üretilebilir. Bunlar
   * sözleşmenin EK bölümlerini besler (bkz. contract-annexes.ts); kurumun
   * elinde eski/eksik bir stub şablon kaldıysa çıktı hukuken zayıf kalıyordu.
   * Taslak HER ZAMAN `active:false` üretilir — etkinleştirme AYRI, yetkili ve
   * audit'lenen bir adımdır (activateTemplateExclusive), asla otomatik değil.
   */
  kind: DocumentTemplateKind = "student_enrollment_contract"
): Promise<DocumentTemplate> {
  const bodyHtml = DEFAULT_BODIES[kind];
  if (!bodyHtml) throw new Error(`Bu belge türü için kurumsal kaynak metni tanımlı değil: ${kind}`);
  return createTemplate({
    tenantId,
    kind,
    name: `${documentKindLabel(kind)} (kurumsal kaynaktan taslak — ${formatDateTr(new Date())})`,
    bodyHtml,
    createdById,
    active: false,
  });
}

/**
 * Faz 6 — bir şablonu ETKİNLEŞTİRİR ve AYNI tenant/tür için diğer TÜM
 * şablonları pasifleştirir (tek-aktif-şablon garantisi). Bu, formal sözleşme
 * üretiminin HANGİ şablonu kullanacağının artık dizi sırasına değil, açık
 * yönetici kararına bağlı olmasını sağlar.
 */
export async function activateTemplateExclusive(tenantId: string, id: string): Promise<DocumentTemplate | null> {
  const target = await getTemplate(tenantId, id);
  if (!target) return null;
  if (isDbMode) {
    const { prisma } = await import("../db");
    await prisma.documentTemplate.updateMany({
      where: { tenantId, kind: target.kind, id: { not: id } },
      data: { active: false },
    });
    const row = await prisma.documentTemplate.update({ where: { id }, data: { active: true } });
    return mapTplDb(row);
  }
  const all = await loadTpl();
  const next = all.map((t) =>
    t.tenantId === tenantId && t.kind === target.kind
      ? { ...t, active: t.id === id, updatedAt: new Date().toISOString() }
      : t
  );
  await saveTpl(next);
  return publicTpl(next.find((t) => t.id === id)!);
}

export type UpdateTemplateInput = {
  name?: string;
  bodyHtml?: string;
};

/** Yönetici tarafından şablon düzenleme — `bodyHtml` verilirse yeniden sanitize edilir, `version` +1 olur. */
export async function updateTemplate(
  tenantId: string,
  id: string,
  patch: UpdateTemplateInput
): Promise<DocumentTemplate | null> {
  const now = new Date().toISOString();
  const safeBody = patch.bodyHtml !== undefined ? sanitizeTemplateHtml(patch.bodyHtml) : undefined;
  if (isDbMode) {
    const { prisma } = await import("../db");
    const existing = await prisma.documentTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const row = await prisma.documentTemplate.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(safeBody !== undefined ? { bodyHtml: safeBody } : {}),
        version: existing.version + 1,
      },
    });
    return mapTplDb(row);
  }
  const all = await loadTpl();
  const idx = all.findIndex((t) => t.id === id && t.tenantId === tenantId);
  if (idx === -1) return null;
  const updated: StoredTpl = {
    ...all[idx],
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(safeBody !== undefined ? { bodyHtml: safeBody } : {}),
    version: (all[idx].version ?? 1) + 1,
    updatedAt: now,
  };
  const next = [...all];
  next[idx] = updated;
  await saveTpl(next);
  return publicTpl(updated);
}

/** Silme yok — arşivleme `active:false` yapar (DocumentInstance ile aynı "soft" desen). */
export async function archiveTemplate(tenantId: string, id: string, active: boolean): Promise<DocumentTemplate | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const existing = await prisma.documentTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const row = await prisma.documentTemplate.update({ where: { id }, data: { active } });
    return mapTplDb(row);
  }
  const all = await loadTpl();
  const idx = all.findIndex((t) => t.id === id && t.tenantId === tenantId);
  if (idx === -1) return null;
  const updated: StoredTpl = { ...all[idx], active, updatedAt: new Date().toISOString() };
  const next = [...all];
  next[idx] = updated;
  await saveTpl(next);
  return publicTpl(updated);
}

/** Yönetim ekranı için — arşivlenmiş DAHİL tüm şablonlar (listTemplates yalnız aktifleri döner). */
export async function listAllTemplates(tenantId: string): Promise<DocumentTemplate[]> {
  await ensureDefaultTemplates(tenantId);
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.documentTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    return rows.map(mapTplDb);
  }
  const all = await loadTpl();
  return all
    .filter((t) => t.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicTpl);
}

export type ContractTemplateDiagnostics = {
  /** Formal sözleşme üretiminde GERÇEKTEN kullanılacak şablon (bkz. selectActiveContractTemplate) — yoksa null. */
  selectedTemplate: DocumentTemplate | null;
  missingRequired: { key: string; label: string }[];
  unsupportedTokens: string[];
  /** Aynı tür için BİRDEN FAZLA aktif şablon varsa (tek-aktif garantisi henüz uygulanmamış eski veri) uyarı amaçlı sayı. */
  activeTemplateCountForKind: number;
  isReadyForFormalGeneration: boolean;
};

/** Faz 6 — "Sözleşme Şablonları" ekranının tanılama paneli için: aktif şablon + eksik/desteklenmeyen alan listesi. */
export async function getContractTemplateDiagnostics(tenantId: string): Promise<ContractTemplateDiagnostics> {
  const { selectActiveContractTemplate, findMissingRequiredContractPlaceholders, findUnsupportedPlaceholders } =
    await import("../contract-template-schema");
  const templates = await listTemplates(tenantId);
  const activeForKind = templates.filter((t) => t.kind === "student_enrollment_contract");
  const selected = selectActiveContractTemplate(activeForKind) ?? null;
  const missingRequired = selected ? findMissingRequiredContractPlaceholders(selected.bodyHtml) : [];
  const unsupportedTokens = selected ? findUnsupportedPlaceholders(selected.bodyHtml) : [];
  return {
    selectedTemplate: selected,
    missingRequired,
    unsupportedTokens,
    activeTemplateCountForKind: activeForKind.length,
    isReadyForFormalGeneration: selected !== null && missingRequired.length === 0,
  };
}

const KIND_LABELS: Record<DocumentTemplateKind, string> = {
  student_enrollment_contract: "Öğrenci Kayıt Sözleşmesi",
  parent_social_media_consent: "Veli / Sosyal Medya İzni",
  kvkk: "KVKK",
  teacher_contract: "Öğretmen Sözleşmesi",
  teacher_info_form: "Öğretmen Bilgi Formu",
  trial_form: "Deneme Formu",
  makeup_request: "Telafi Talebi",
  payment_commitment: "Ödeme Taahhüdü",
  petition: "Dilekçe",
  custom: "Özel Şablon",
};

export function documentKindLabel(kind: DocumentTemplateKind): string {
  return KIND_LABELS[kind] ?? kind;
}

/**
 * Evrak statü etiketleri, İSTEMCİ-GÜVENLİ ayrı bir modülde
 * (`src/lib/document-status.ts`). Bu dosya Prisma/pg'yi içeri aldığı için
 * `"use client"` bileşenlerinden import EDİLEMEZ; `documents-table.tsx`
 * statü etiketine ihtiyaç duyduğunda saf modülden okur. Buradaki
 * re-export yalnız sunucu tarafı çağıranların kolaylığı içindir.
 */
export {
  documentStatusLabel,
  documentStatusHint,
  isActiveDocumentStatus,
} from "../document-status";


function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * `{{key}}` VEYA `{{namespace.key}}` (ör. `{{student.fullName}}`) —
 * `fields` düz bir Record olduğu için nokta dahil TÜM anahtar aynen
 * `fields["student.fullName"]` olarak aranır (çağıran taraf — tools.ts
 * createDocumentInstanceTool — hem eski düz anahtarları hem yeni
 * namespace'li anahtarları AYNI `fields` objesinde birlikte doldurur).
 * Bulunamayan HER placeholder için boş string döner — asla hata fırlatmaz
 * (kural: eksik veri güvenli/boş davranır).
 *
 * GÜVENLİK: değerler HTML-ESCAPE edilerek enjekte edilir — şablonun
 * KENDİSİ (`bodyHtml`) sanitize edilse bile, alan değerleri (ör. yönetici
 * tarafından serbest metin olarak girilen `freeText`) ham HTML olarak
 * yazılırsa ikinci bir XSS yolu açardı. `renderedHtml` sonradan
 * `dangerouslySetInnerHTML` ile gösterilip yazdırıldığı için bu kritik.
 */
export function renderTemplate(bodyHtml: string, fields: Record<string, string>): string {
  return bodyHtml.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => escapeHtml(fields[key] ?? ""));
}

/**
 * P0 (2026-08-30, boş taksit satırı düzeltmesi) — taksit tablosu SABİT 12
 * `{{taksitN...}}` satırından oluşur (yukarıdaki yorum, `renderTemplate`'in
 * `{{#each}}` DESTEKLEMEDİĞİ tasarım kararı). `installmentCount < 12` olan
 * sözleşmelerde (ör. 5 aylık) kullanılmayan satırlar boş tarih + " TL"
 * olarak GÖRÜNÜR KALIYORDU — bu, yazdırılan resmi belgede "boş, açıklanmamış
 * satır" hatasıydı. Bu fonksiyon, `renderTemplate` çağrılmadan ÖNCE, ham
 * şablon metninde (`bodyHtml`) `installmentCount`'un ÜZERİNDEKİ
 * `{{taksitN...}}` alanlarını içeren `<tr>...</tr>` satırlarını bütünüyle
 * kaldırır. Placeholder token'ına göre çalışır — tablo kolon sayısı/sırası
 * ileride değişse bile (ör. "Ödeme Şekli" kolonu eklenirse) kırılmaz. Yalnızca
 * YENİ oluşturulan belgeleri etkiler; geçmiş sözleşmelerin zaten kaydedilmiş
 * `renderedHtml`'i DEĞİŞMEZ (immutable snapshot kuralı korunur).
 */
export function stripUnusedInstallmentRows(bodyHtml: string, installmentCount: number): string {
  if (installmentCount >= 12) return bodyHtml;
  let result = bodyHtml;
  for (let i = installmentCount + 1; i <= 12; i++) {
    const rowRegex = new RegExp(
      `<tr>(?:(?!</tr>)[\\s\\S])*?\\{\\{taksit${i}(?:Tarih|Tutar)\\}\\}(?:(?!</tr>)[\\s\\S])*?</tr>\\s*`,
      "g"
    );
    result = result.replace(rowRegex, "");
  }
  return result;
}

/**
 * Aynı `reference` tenant içinde ZATEN varsa (istatistiksel olarak imkansıza
 * yakın ama `instanceId` çakışması dışında da tetiklenebilir — ör. aynı
 * kind+yıl kombinasyonunda hash çakışması) yeni bir `id` ile tekrar dener.
 * DB modunda gerçek `@@unique([tenantId, reference])` ihlali (P2002) da
 * aynı şekilde yeniden denemeyi tetikler — çift kayıt asla DB'ye yazılmaz.
 */
const REFERENCE_COLLISION_MAX_RETRY = 3;

export async function createDocumentInstance(input: {
  tenantId: string;
  templateId: string;
  kind: DocumentTemplateKind;
  fieldValues: Record<string, string>;
  studentId?: string;
  teacherId?: string;
  trialLessonId?: string;
  branchId?: string;
  createdBy: string;
  /** Yalnızca `student_enrollment_contract` için — bkz. stripUnusedInstallmentRows. */
  installmentCount?: number;
  /** Varsayılan "issued" (üretildi, arşivde kalıcı). Tarihi/arşiv toplu içe aktarım "uploaded" geçer (bkz. historical-contracts.ts). */
  status?: DocumentInstanceStatus;
}): Promise<DocumentInstance> {
  const tpl = await getTemplate(input.tenantId, input.templateId);
  let body = tpl?.bodyHtml ?? input.fieldValues.__bodyHtml ?? "";
  if (input.kind === "student_enrollment_contract" && input.installmentCount !== undefined) {
    body = stripUnusedInstallmentRows(body, input.installmentCount);
  }
  const now = new Date().toISOString();
  const year = new Date(now).getFullYear();

  for (let attempt = 0; attempt < REFERENCE_COLLISION_MAX_RETRY; attempt++) {
    const id = uid("doc");
    const reference = buildDocumentReference(input.kind, id, year);
    const renderedHtml = renderTemplate(body, {
      ...input.fieldValues,
      reference,
      "document.referenceNumber": reference,
      "document.createdAt": now,
    });
    const row: StoredInst = {
      id,
      tenantId: input.tenantId,
      templateId: input.templateId,
      kind: input.kind,
      reference,
      status: input.status ?? "issued",
      studentId: input.studentId,
      teacherId: input.teacherId,
      trialLessonId: input.trialLessonId,
      branchId: input.branchId,
      fieldValues: input.fieldValues,
      renderedHtml,
      printCount: 0,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    if (isDbMode) {
      const { prisma } = await import("../db");
      try {
        await prisma.documentInstance.create({
          data: {
            id: row.id,
            tenantId: input.tenantId,
            templateId: row.templateId,
            kind: row.kind,
            reference: row.reference,
            status: row.status,
            studentId: row.studentId,
            teacherId: row.teacherId,
            trialLessonId: row.trialLessonId,
            branchId: row.branchId,
            fieldValues: row.fieldValues,
            renderedHtml: row.renderedHtml,
            printCount: 0,
            createdBy: row.createdBy,
          },
        });
      } catch (e) {
        // Prisma P2002 = unique constraint ihlali (tenantId+reference) — yeniden dene.
        const isUniqueViolation = typeof e === "object" && e !== null && "code" in e && e.code === "P2002";
        if (isUniqueViolation && attempt < REFERENCE_COLLISION_MAX_RETRY - 1) continue;
        throw e;
      }
    } else {
      const all = await loadInst();
      if (all.some((x) => x.tenantId === input.tenantId && x.reference === reference)) {
        if (attempt < REFERENCE_COLLISION_MAX_RETRY - 1) continue;
        throw new Error("Belge referans numarası çakışması — lütfen tekrar deneyin.");
      }
      all.push(row);
      await saveInst(all);
    }
    const { tenantId: _t, ...pub } = row;
    void _t;
    return pub;
  }
  // Buraya asla ulaşılmamalı (döngü içinde her zaman return/throw var) — TS için savunma.
  throw new Error("Belge oluşturulamadı.");
}

type DbInstanceRow = {
  id: string;
  templateId: string;
  kind: string;
  reference: string;
  status: string;
  studentId: string | null;
  teacherId: string | null;
  trialLessonId: string | null;
  branchId: string | null;
  fieldValues: unknown;
  renderedHtml: string | null;
  printCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  fileName?: string | null;
  fileMimeType?: string | null;
  fileData?: string | null;
  fileSize?: number | null;
  signedUploadedAt?: Date | null;
  signedBy?: string | null;
  signedVersions?: unknown;
};

function mapDbInstance(r: DbInstanceRow): DocumentInstance {
  return {
    id: r.id,
    templateId: r.templateId,
    kind: r.kind as DocumentTemplateKind,
    reference: r.reference,
    status: r.status as DocumentInstanceStatus,
    studentId: r.studentId ?? undefined,
    teacherId: r.teacherId ?? undefined,
    trialLessonId: r.trialLessonId ?? undefined,
    branchId: r.branchId ?? undefined,
    fieldValues: r.fieldValues as Record<string, string>,
    renderedHtml: r.renderedHtml ?? undefined,
    printCount: r.printCount,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    fileName: r.fileName ?? undefined,
    fileMimeType: r.fileMimeType ?? undefined,
    fileData: r.fileData ?? undefined,
    fileSize: r.fileSize ?? undefined,
    signedUploadedAt: r.signedUploadedAt ? r.signedUploadedAt.toISOString() : undefined,
    signedBy: r.signedBy ?? undefined,
    signedVersions: (r.signedVersions as DocumentInstance["signedVersions"]) ?? undefined,
  };
}

export async function getDocumentInstance(
  tenantId: string,
  id: string
): Promise<DocumentInstance | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const r = await prisma.documentInstance.findFirst({ where: { id, tenantId, status: { not: DELETED_DOCUMENT_STATUS } } });
    if (!r) return null;
    return mapDbInstance(r);
  }
  const all = await loadInst();
  const r = all.find((x) => x.id === id && x.tenantId === tenantId && x.status !== DELETED_DOCUMENT_STATUS);
  if (!r) return null;
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

export type DocumentInstanceFilters = {
  kind?: DocumentTemplateKind;
  status?: DocumentInstanceStatus;
  studentId?: string;
  teacherId?: string;
  branchId?: string;
  reference?: string;
};

/** Evraklar Merkezi ana tablosu — kurumun TÜM evrak örnekleri, isteğe bağlı filtrelerle. */
/**
 * Ham dosya baytını (`fileData`) YANITTAN ÇIKARIR — liste görünümü yalnızca
 * metadata'ya (fileName/fileMimeType/fileSize/signedUploadedAt) ihtiyaç
 * duyar; ham içerik yalnızca tekil `getDocumentInstance` (dosya indirme
 * rotasının okuduğu AYNI fonksiyon) üzerinden, sahiplik kontrolü geçtikten
 * sonra erişilebilir olmalı (kural E).
 */
function stripFileData(doc: DocumentInstance): DocumentInstance {
  const { fileData: _fd, ...rest } = doc;
  void _fd;
  return rest;
}

export async function listDocumentInstances(
  tenantId: string,
  filters: DocumentInstanceFilters = {}
): Promise<DocumentInstance[]> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.documentInstance.findMany({
      where: {
        tenantId,
        ...(filters.kind ? { kind: filters.kind } : {}),
        status: filters.status && filters.status !== DELETED_DOCUMENT_STATUS ? filters.status : { not: DELETED_DOCUMENT_STATUS },
        ...(filters.studentId ? { studentId: filters.studentId } : {}),
        ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.reference
          ? { reference: { contains: filters.reference } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapDbInstance).map(stripFileData);
  }
  const all = await loadInst();
  return all
    .filter((x) => x.tenantId === tenantId && x.status !== DELETED_DOCUMENT_STATUS)
    .filter((x) => !filters.kind || x.kind === filters.kind)
    .filter((x) => !filters.status || x.status === filters.status)
    .filter((x) => !filters.studentId || x.studentId === filters.studentId)
    .filter((x) => !filters.teacherId || x.teacherId === filters.teacherId)
    .filter((x) => !filters.branchId || x.branchId === filters.branchId)
    .filter((x) => !filters.reference || x.reference.toLowerCase().includes(filters.reference.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ tenantId: _t, ...pub }) => {
      void _t;
      return stripFileData(pub);
    });
}

/**
 * 2026-09-29 — evrak "Sil" = SOFT DELETE: yalnız arşivlenmiş ("cancelled") evrak
 * "deleted" olur; satır, dosya baytı ve imzalı sürüm geçmişi VERİTABANINDA KALIR
 * (yasal saklama), yalnız bu modülün tüm okuma yollarından (liste, detay, indirme,
 * yazdırma, arşiv, yükleme) çıkar. Koşullu güncelleme: çift tıklama/eşzamanlı
 * istek ikinci kez işlem yapmaz (`false` döner). Aktör/gerekçe denetim kaydındadır.
 */
export const DELETED_DOCUMENT_STATUS: DocumentInstanceStatus = "deleted";

export async function softDeleteArchivedDocumentInstance(tenantId: string, id: string): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const r = await prisma.documentInstance.updateMany({
      where: { id, tenantId, status: "cancelled" },
      data: { status: DELETED_DOCUMENT_STATUS },
    });
    return r.count === 1;
  }
  const all = await loadInst();
  const idx = all.findIndex((x) => x.id === id && x.tenantId === tenantId && x.status === "cancelled");
  if (idx < 0) return false;
  all[idx] = { ...all[idx], status: DELETED_DOCUMENT_STATUS, updatedAt: new Date().toISOString() };
  await saveInst(all);
  return true;
}

/** Silme yok — arşivleme "cancelled" durumuna geçirir (Faz 2 durum listesiyle aynı anlam). */
export async function archiveDocumentInstance(
  tenantId: string,
  id: string
): Promise<DocumentInstance | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const r = await prisma.documentInstance.findFirst({ where: { id, tenantId, status: { not: DELETED_DOCUMENT_STATUS } } });
    if (!r) return null;
    await prisma.documentInstance.update({ where: { id }, data: { status: "cancelled" } });
    return getDocumentInstance(tenantId, id);
  }
  const all = await loadInst();
  const idx = all.findIndex((x) => x.id === id && x.tenantId === tenantId && x.status !== DELETED_DOCUMENT_STATUS);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], status: "cancelled", updatedAt: new Date().toISOString() };
  await saveInst(all);
  const { tenantId: _t, ...pub } = all[idx];
  void _t;
  return pub;
}

/**
 * İmzalı/taranmış sürüm yükleme — status "uploaded" olur, imzalayan sorumlu
 * ve zaman kaydedilir. ÖNCEKİ sürüm ÜZERİNE YAZILMAZ: `signedVersions`
 * geçmişine yeni bir metadata kaydı EKLENİR (append-only), yalnızca GÜNCEL
 * sürümün ham baytı `fileData`'da tutulur (kural E — "eskisini yok etmek
 * yerine sürüm geçmişinde tut; en güncel sürüm varsayılan indirilen olsun").
 */
export async function uploadSignedDocumentFile(
  tenantId: string,
  id: string,
  file: { fileName: string; fileMimeType: string; fileData: string; fileSize: number },
  uploadedBy: string
): Promise<DocumentInstance | null> {
  const now = new Date();
  const versionEntry = {
    id: uid("dver"),
    fileName: file.fileName,
    fileMimeType: file.fileMimeType,
    fileSize: file.fileSize,
    uploadedAt: now.toISOString(),
    uploadedBy,
  };
  if (isDbMode) {
    const { prisma } = await import("../db");
    const r = await prisma.documentInstance.findFirst({ where: { id, tenantId, status: { not: DELETED_DOCUMENT_STATUS } } });
    if (!r) return null;
    const existingVersions = Array.isArray(r.signedVersions) ? r.signedVersions : [];
    await prisma.documentInstance.update({
      where: { id },
      data: {
        status: "uploaded",
        fileName: file.fileName,
        fileMimeType: file.fileMimeType,
        fileData: file.fileData,
        fileSize: file.fileSize,
        signedUploadedAt: now,
        signedBy: uploadedBy,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signedVersions: [...existingVersions, versionEntry] as any,
      },
    });
    return getDocumentInstance(tenantId, id);
  }
  const all = await loadInst();
  const idx = all.findIndex((x) => x.id === id && x.tenantId === tenantId && x.status !== DELETED_DOCUMENT_STATUS);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    status: "uploaded",
    fileName: file.fileName,
    fileMimeType: file.fileMimeType,
    fileData: file.fileData,
    fileSize: file.fileSize,
    signedUploadedAt: now.toISOString(),
    signedBy: uploadedBy,
    signedVersions: [...(all[idx].signedVersions ?? []), versionEntry],
    updatedAt: now.toISOString(),
  };
  await saveInst(all);
  const { tenantId: _t, ...pub } = all[idx];
  void _t;
  return pub;
}

/**
 * İmzalı sürüm geçmişinden BİR kaydı soft-delete eder (audit izi kalır,
 * hard delete YOK — modül geneliyle aynı desen). Silinen kayıt GÜNCEL
 * (`fileData` ile eşleşen) sürümse, dosya alanları temizlenir ve durum
 * `sent_for_signature`'a geri döner — eski sürümlerin ham baytı zaten
 * saklanmadığı için (yalnızca metadata) otomatik bir öncekine "geri dönme"
 * YAPILAMAZ; yönetici yeniden yükler. Bu sınır kodda ve teslim raporunda
 * açıkça belirtilir.
 */
export async function softDeleteSignedVersion(
  tenantId: string,
  documentId: string,
  versionId: string
): Promise<DocumentInstance | null> {
  const now = new Date();
  const doc = await getDocumentInstance(tenantId, documentId);
  if (!doc) return null;
  const versions = doc.signedVersions ?? [];
  const versionIdx = versions.findIndex((v) => v.id === versionId && !v.deletedAt);
  if (versionIdx === -1) return null;
  const nextVersions = versions.map((v, i) => (i === versionIdx ? { ...v, deletedAt: now.toISOString() } : v));
  const wasCurrent = versions[versionIdx]!.fileName === doc.fileName && versions[versionIdx]!.uploadedAt === doc.signedUploadedAt;

  if (isDbMode) {
    const { prisma } = await import("../db");
    await prisma.documentInstance.update({
      where: { id: documentId },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signedVersions: nextVersions as any,
        ...(wasCurrent
          ? { status: "sent_for_signature", fileName: null, fileMimeType: null, fileData: null, fileSize: null }
          : {}),
      },
    });
    return getDocumentInstance(tenantId, documentId);
  }
  const all = await loadInst();
  const idx = all.findIndex((x) => x.id === documentId && x.tenantId === tenantId && x.status !== DELETED_DOCUMENT_STATUS);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    signedVersions: nextVersions,
    updatedAt: now.toISOString(),
    ...(wasCurrent
      ? {
          status: "sent_for_signature" as DocumentInstanceStatus,
          fileName: undefined,
          fileMimeType: undefined,
          fileData: undefined,
          fileSize: undefined,
        }
      : {}),
  };
  await saveInst(all);
  const { tenantId: _t, ...pub } = all[idx];
  void _t;
  return pub;
}

/** Yeniden basım: aynı referans, printCount++ */
export async function markDocumentPrinted(
  tenantId: string,
  id: string
): Promise<DocumentInstance | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const r = await prisma.documentInstance.findFirst({ where: { id, tenantId, status: { not: DELETED_DOCUMENT_STATUS } } });
    if (!r) return null;
    const u = await prisma.documentInstance.update({
      where: { id },
      data: { status: "printed", printCount: r.printCount + 1 },
    });
    return getDocumentInstance(tenantId, u.id);
  }
  const all = await loadInst();
  const idx = all.findIndex((x) => x.id === id && x.tenantId === tenantId && x.status !== DELETED_DOCUMENT_STATUS);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    status: "printed",
    printCount: all[idx].printCount + 1,
    updatedAt: new Date().toISOString(),
  };
  await saveInst(all);
  const { tenantId: _t, ...pub } = all[idx];
  void _t;
  return pub;
}

export async function listDocumentsForStudent(
  tenantId: string,
  studentId: string
): Promise<DocumentInstance[]> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.documentInstance.findMany({
      where: { tenantId, studentId, status: { not: DELETED_DOCUMENT_STATUS } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapDbInstance).map(stripFileData);
  }
  const all = await loadInst();
  return all
    .filter((x) => x.tenantId === tenantId && x.studentId === studentId && x.status !== DELETED_DOCUMENT_STATUS)
    .map(({ tenantId: _t, ...pub }) => {
      void _t;
      return stripFileData(pub);
    });
}

export async function listTemplates(tenantId: string): Promise<DocumentTemplate[]> {
  await ensureDefaultTemplates(tenantId);
  if (isDbMode) {
    const { prisma } = await import("../db");
    const rows = await prisma.documentTemplate.findMany({ where: { tenantId, active: true } });
    return rows.map(mapTplDb);
  }
  const all = await loadTpl();
  return all.filter((t) => t.tenantId === tenantId && t.active).map(publicTpl);
}

export async function getTemplate(
  tenantId: string,
  id: string
): Promise<DocumentTemplate | null> {
  if (isDbMode) {
    const { prisma } = await import("../db");
    const r = await prisma.documentTemplate.findFirst({ where: { id, tenantId } });
    return r ? mapTplDb(r) : null;
  }
  const all = await loadTpl();
  const t = all.find((x) => x.id === id && x.tenantId === tenantId);
  return t ? publicTpl(t) : null;
}
