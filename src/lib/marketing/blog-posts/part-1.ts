import type { BuiltinPost } from "../blog";

/**
 * Yazım kuralı: işin içinden biri anlatıyormuş gibi. Kalıp açılış ve kapanış yok, gerçek müşteri veya istatistik
 * uydurulmaz; örnekler "diyelim ki" düzeyinde kalır. Hukuk ve vergi konularında uzmanına yönlendirilir.
 */
export const PART_1: BuiltinPost[] = [
  {
    slug: "ogretmen-hastalaninca-muzik-okulu-telafi",
    category: "muzik",
    features: ["telafi-merkezi", "ders-programi", "duyuru-iletisim"],
    title: "Öğretmen hastalandığında müzik okulunda neler olur, neler olmamalı",
    description: "Sabah gelen tek bir mesaj bütün günü dağıtabilir. Telafi işinin nerede sarpa sardığını ve bunu nasıl önleyebileceğinizi konuşalım.",
    body: `Sabah sekiz kırk. Piyano öğretmeninizden mesaj geliyor: "Ateşim var, bugün gelemeyeceğim." O gün programında dokuz öğrenci var. Üçü okuldan çıkıp doğrudan size geliyor, biri şehrin öbür ucundan servisle, ikisinin annesi zaten işten izin alıp getiriyor. Sekreteriniz telefona sarılıyor.

Buraya kadar kimsenin kabahati yok. İnsan hastalanır. Asıl dert üç hafta sonra çıkıyor, bir anne kapıda "Bizim o dersi hâlâ yapmadık" dediğinde ve kimse o dersin yapılıp yapılmadığını tam olarak bilmediğinde.

## Defterin arkasına yazılan telafi

Müzik okullarında telafi takibi genelde birkaç yere dağılmış durumdadır. Bir kısmı sekreterin defterinde, bir kısmı öğretmenin telefonunda, bir kısmı da velinin aklındadır. Üçü birbirini tutmaz. Öğretmen "Ben onu geçen salı yaptım" der, veli "O normal dersimizdi" der. İkisi de yalan söylemiyor, ikisi de kendi notuna bakıyor.

Bu tartışma küçük görünür ama kurumun en pahalı tartışmalarından biridir. Çünkü kaybettiğiniz şey bir ders ücreti olmaz, velinin size duyduğu güven olur. Bir kere "Burada kimse takip etmiyor" duygusu oluştu mu, sonraki her küçük aksaklık onun kanıtı gibi görünmeye başlar.

## Kimden kaynaklandığını ayırın

İlk yapılacak iş, iptali kimin yaptığını kayda geçirmek. Öğretmen hastalandıysa öğrencinin hakkı kesindir, kimse bunu tartışmaz. Öğrenci son dakikada "Bugün gelemiyoruz" dediyse durum başkadır ve kurumunuzun kuralı neyse o geçerlidir. Bu ikisini aynı listeye aynı şekilde yazarsanız, bir süre sonra herkes bütün iptallerin telafisi olduğunu düşünmeye başlar. Öğretmeninizin takvimi de telafiyle dolar, normal derse yer kalmaz.

Birçok kurum sahibi bu kuralı kafasında bilir ama yazmamıştır. Kayıt sırasında veliye de anlatılmamıştır. Sonra ilk tartışmada kural orada, o an icat edilmiş gibi görünür. Kaç saat önceden haber verilirse hak doğar, ayda kaç telafi hakkı vardır, telafi ne kadar süre içinde kullanılmalıdır: bunlar sözleşmede ya da en azından kayıtta verilen bir kâğıtta yazıyorsa, sekreteriniz kapıda kendini savunmak zorunda kalmaz.

## Son kullanma tarihi kimseye kötülük değildir

Telafi hakkına süre koymaktan çekinen çok kurum var, "Veli kırılır" diye. Oysa süresiz telafi, altı ay sonra birinin gelip "Bizim dört dersimiz vardı" demesi anlamına gelir. O dersleri hangi öğretmen, hangi boş saatte yapacak? Süre, velinin aleyhine bir kural gibi dursa da aslında dersin gerçekten yapılmasını sağlar. Kırk beş gün içinde kullanılması gereken bir hakkı insanlar kullanır. Süresiz olanı unuturlar, sonra hatırlayıp kırılırlar.

Sürenin bitmesine yakın bir hatırlatma da işin geri kalanını halleder. "Elif'in iki telafi hakkı var, son on iki gün. Perşembe 16.00 ya da cumartesi 11.00 uygun, hangisini yazalım?" Bu mesajı alan veli şikâyet etmez, teşekkür eder. Dikkat ettiyseniz mesajın içinde saat var. "Ne zaman gelmek istersiniz?" diye sorarsanız cevap akşam gelir, o saat de dolmuş olur.

## Hastalık uzarsa

Bir günlük ateş kolay. Öğretmeniniz bir hafta ya da üç hafta yoksa iş değişiyor. Yerine başka bir öğretmen girsin mi? Bu soru bir matematik kursunda kolay cevaplanır, müzik okulunda öyle değil. Öğrenci o öğretmenle bir dil tutturmuştur, elinin duruşunu o düzeltmiştir, on yaşındaki bir çocuk başka birinin karşısına oturmak istemeyebilir. Veli de "Biz Selin Hoca için geldik" diyebilir.

Bunu öğrenciye dayatmayın, sorun. "Selin Hoca iki hafta yok. İsterseniz Burak Hoca derslere girsin, isterseniz bekleyelim ve dersleri Selin Hoca dönünce telafi edelim." Çoğu aile küçük çocukta beklemeyi, sınava hazırlanan öğrencide de yerine birinin girmesini seçiyor. Yerine giren öğretmenin de dersi körlemesine yapmaması lazım. Öğrenci hangi parçada, neye çalışıyordu, geçen ders ne konuşuldu? Bu bilgi Selin Hoca'nın telefonundaysa ve o da ateşler içinde yatıyorsa, kimseye sormadan öğrenemezsiniz. Ders notlarının kısa da olsa ortak bir yerde durmasının değeri o hafta ortaya çıkıyor.

Bir de ücret tarafını konuşun. Yerine giren öğretmenin saatlik ücreti farklıysa aradaki farkı kim üstlenecek? Bu sorunun cevabı neredeyse her zaman kurum olur, ama bunu bilerek kabul etmek başka, ay sonunda şaşırmak başka.

## O sabah ne yapılmalı

Öğretmen hastalandığında sekreterin önünde dört şey olmalı: o gün kimlerin dersi var, velilerin numarası, varsa o saatlerde boş olan diğer öğretmenler, bir de hazır bir mesaj. Bunları sırayla bulmak yarım saat sürer, yarım saatte ilk öğrenci çoktan yola çıkmıştır.

Mesajın da biraz insanca olması iyi olur. "Dersiniz iptal edilmiştir" yazısı devlet dairesi kokar. "Selin Hocamız bugün rahatsızlandı, Mert'in 16.00 dersini yapamayacağız. Dersi telafi olarak hesabına yazdık, uygun saatleri birazdan paylaşıyoruz." İki cümle. Veli hem nedenini öğrendi hem de hakkının yazıldığını gördü.

Bir de öğretmene bir şey söylemek gerek. Hastalanan öğretmenin aklı da o dokuz öğrencide kalır. Telafilerin kaydının tutulduğunu bilirse döndüğünde ne yapacağını bilir, veliyle kendisi pazarlık etmeye çalışmaz. Bazı öğretmenler iyi niyetle kendi boş saatinde dersi yapar, kimseye haber vermez. Ay sonunda hakediş hesabında o ders görünmez ve bu sefer öğretmenle tartışırsınız. Yani tek bir kayıt iki ayrı kavgayı önlüyor.

Telafiyi tek bir yerde, öğrencinin adının yanında, süresiyle birlikte görebildiğiniz gün bu konu gündeminizden çıkar. Defter olur, tablo olur, yazılım olur, ona siz karar verin. Yeter ki herkes aynı yere baksın.`,
  },
  {
    slug: "muzik-ogretmeni-hakedis-hesabi",
    category: "muzik",
    features: ["ogretmen-hakedis", "yoklama-takvimi", "finans-ozeti"],
    title: "Ay sonunda öğretmenle aynı rakamı görmek",
    description: "Hakediş tartışmaları genelde paradan çıkmaz, iki ayrı listeden çıkar. Müzik okullarında öğretmen ödemesini sakin bir konuya dönüştürmenin yolları.",
    body: `Bir müzik okulu işletiyorsanız ayın son iki gününü bilirsiniz. Öğretmen elinde telefonuyla gelir, "Ben bu ay kırk yedi ders yapmışım" der. Sizin tablonuzda kırk dört görünür. Aradaki üç ders için yarım saat konuşursunuz, sonunda ya siz vazgeçersiniz ya öğretmen vazgeçer, ama vazgeçen taraf o konuşmayı unutmaz.

Bu tartışma çoğu zaman para tartışması değildir. İki kişi iki ayrı listeye bakıyordur. Öğretmen kendi notlarını tutar, çünkü kurumun listesini görmez. Kurum da kendi listesini tutar, çünkü öğretmenin notuna güvenemez. Ay boyunca kimse kimseye yanlış bir şey söylemez, sadece ay sonunda iki liste ilk kez yan yana gelir.

## Hangi ders sayılır?

Bir öğretmenle anlaşırken genelde ders başı ücret konuşulur, geri kalanı "Hallederiz" diye geçer. Oysa kavganın tamamı o geri kalandadır. Şöyle bir sorular listesi yapın ve cevaplarını yazın:

- Öğrenci haber vermeden gelmediyse, öğretmen de saatinde oradaysa ödeme yapılıyor mu?
- Öğrenci bir gün önceden iptal ettiyse ne oluyor?
- Telafi dersi normal ders gibi mi sayılıyor?
- Deneme dersine ücret ödeniyor mu? Kayıt çıkarsa fark var mı?
- Otuz dakikalık ders ile altmış dakikalık dersin oranı ne?
- Grup dersinde öğrenci sayısı ücreti değiştiriyor mu?

Bu altı sorunun cevabı kurumdan kuruma değişir, doğru cevap diye bir şey de yok. Bir kurum "Öğretmen geldiyse ödenir" der, öğretmen memnun olur, kurum riski üstlenir. Bir başkası yarısını öder. Önemli olan cevabın işe başlarken söylenmiş olması. Üçüncü ayda ortaya çıkan kural, öğretmene hep kendi aleyhine uydurulmuş gibi gelir.

## Bir örnek

Diyelim ki keman öğretmeninizle ders başı bir ücrette anlaştınız. Bu ay şöyle bir tablo var: otuz sekiz normal ders işlendi, iki öğrenci haber vermeden gelmedi, bir öğrenci bir gün önceden iptal etti, üç telafi yapıldı, iki de deneme dersi verildi.

Toplam kaç ders ödenecek? Kuralınız yazılı değilse bu sorunun cevabı kırk üç ile kırk beş arasında bir yerde gezer ve kimin haklı olduğunu kimse bilemez. Kural yazılıysa cevap tek olur ve hesabı sekreteriniz de yapar, öğretmen de, siz de. Aynı sayıyı bulursunuz.

İşin güzel tarafı, iş kurala bağlandığında öğretmenler de rahatlıyor. Kimse patronundan para istemeyi sevmez. "Şu üç dersi saymamışsınız" demek bir öğretmen için de nahoş bir konuşmadır.

## Ay sonunu beklemeyin

Asıl değişiklik, öğretmenin kendi rakamını ayın içinde görebilmesiyle olur. Yirminci gün "Şu ana kadar yirmi dokuz ders" yazısını gören öğretmen, bir eksik varsa o gün söyler. Üzerinden on gün geçmemiştir, herkes hatırlıyordur, sekreterinizin yoklamayı yanlış işaretlediği ders iki dakikada düzelir.

Ay sonunda ise o ders artık kimsenin aklında değildir. Elde bir rakam kalır, tartışma da rakam üzerine döner.

Burada yoklamanın önemi ortaya çıkıyor. Hakediş dediğimiz şey aslında yoklamanın toplamıdır. Yoklama sağlam girilmiyorsa dünyanın en güzel hesap tablosunu yapsanız da faydası olmaz. Öğretmen yoklamayı dersin bitiminde kendi telefonundan giriyorsa hem kayıt anında tutulmuş olur hem de öğretmen o kaydın sahibi olur. Kendi girdiği kayda itiraz edecek hâli yoktur.

## Bir ayın dersi öbür aya sarkınca

Hakediş hesabını en çok karıştıran şeylerden biri ay sınırıdır. Veli kasım ayının ücretini ödemiş, dersin biri telafiye kalmış ve aralıkta yapılmış. O ders öğretmene kasımda mı yazılacak, aralıkta mı? Dönem paketi satıyorsanız mesele daha da büyür, çünkü para tek seferde geliyor ama dersler dört aya yayılıyor. Kasadaki paraya bakıp "Bu ay iyi kazandık" derken, aslında önümüzdeki üç ayın öğretmen ücretini de kasada tutuyorsunuzdur.

Basit bir kural koyun: öğretmen dersi hangi ay yaptıysa hakediş o aya yazılır, velinin ne zaman ödediği öğretmeni ilgilendirmez. Öğretmen için en temizi budur. Veli ödememiş diye öğretmenin parasını bekletmeye başladığınızda, tahsilat riskini öğretmene yıkmış olursunuz ve öğretmen bunu çok çabuk fark eder.

Ücret güncellemesi de aynı yerde sorun çıkarıyor. Ocakta öğretmenin ders ücretini artırdınız. Aralıkta yapılıp ocakta hesaplanan telafi hangi ücretten ödenecek? Küçük bir ayrıntı gibi görünüyor, ama kimse yazmadığı için her yıl yeniden tartışılıyor. Ücret değişikliğinin hangi tarihten itibaren yapılan derslere uygulanacağını yazın, tartışma biter. Eski tarihli derslerin eski ücretten kalması da kimseye haksızlık sayılmaz.

## Rakamların dışında kalanlar

Bir de işin muhasebe tarafı var. Öğretmen serbest meslek makbuzu mu kesiyor, bordrolu mu, kısmi süreli mi? Kesintiler nasıl hesaplanıyor? Bu tamamen sizin yapınıza bağlı ve mali müşavirinizin vereceği bir karar. Burada akıl vermek bize düşmez. Yalnız şunu söyleyebiliriz: mali müşavire ay sonunda dağınık bir liste vermekle öğretmen öğretmen, ders ders ayrılmış net bir döküm vermek arasında çok fark var. Müşavirinizin size ayırdığı zaman da değişir, sizin ona sorduğunuz soru da.

Hakedişi konuşmak hiçbir zaman keyifli olmayacak, para konuşmak öyledir. Ama konuşmanın süresini yarım saatten iki dakikaya indirebilirsiniz. Öğretmen de siz de aynı rakama bakıyorsanız geriye konuşacak pek bir şey kalmıyor. Sonra o yarım saati daha iyi bir şeye ayırırsınız. Örneğin geçen ay neden o kadar çok iptal olduğuna.`,
  },
  {
    slug: "dans-okulu-yil-sonu-gosterisi",
    category: "dans-bale",
    features: ["grup-dersleri", "odeme-takibi", "duyuru-iletisim"],
    title: "Yıl sonu gösterisine iki ay kala dans okulunda kimse uyumuyor",
    description: "Kostüm parası, prova takvimi, fotoğraf izni, salon kirası. Gösteri sezonunu sinir krizine dönüşmeden atlatmak için işin içinden notlar.",
    body: `Dans okulu sahibi olan biri için mayıs ayı başka bir aydır. Takvime bakarsınız, gösteriye yedi hafta var. On iki koreografi, yetmiş küsur çocuk, kiralanmış bir salon, kostümcüyle bitmeyen yazışmalar ve her gün en az iki veliden gelen "Kızım hangi grupta çıkıyor?" sorusu.

Gösteri, okulunuzun bütün yıl yaptığı işin vitrinidir. Velilerin çoğu sizi bir yıl boyunca dışarıdan izledi, ilk kez o gün tam olarak görecekler. Bir de o gün ağlayan bir beş yaşındaki, kostümü olmayan bir öğrenci ya da yarım saat geciken bir açılış varsa, hatırlanan o olur.

Aksamalar hep aynı yerlerden çıkıyor. Sırayla gidelim.

## Kostüm parası

En sık yaşanan kavga burada. Kostüm bedelini ne zaman, kimden, nasıl topladığınız çoğu zaman bir WhatsApp mesajıyla başlar. Beş veli o gün gönderir, on ikisi "Akşam atarım" der, üçü duymamıştır. Bir ay sonra kostümcüye ödeme yapacaksınız ve elinizde kimin ödediğini gösteren tek şey, banka hareketleri ve hafızanız.

Kostümü aylık aidatla karıştırmayın. Ayrı bir kalem olarak açın, kim ödedi kim ödemedi tek listede görünsün. Beden bilgisini de aynı anda alın. Eylülde alınmış ölçüyle mayısta dikilen kostümün çocuğa olmadığını çoğunuz yaşamışsınızdır. Son ölçüyü gösteriden en az altı hafta önce almak için takvime yazın.

Bir de ödeme gücü konusu var. Bazı veliler için kostüm bedeli küçük bir para olmayabilir. Bunu toplu bir grupta "Hâlâ ödemeyenler var" diye duyurmak o aileyi çok zor durumda bırakır, gösteri neşesini de kaçırır. Hatırlatmayı tek tek ve özelden yapın.

## Prova takvimi normal dersleri yer

Gösteriye dört hafta kala herkes aynı salonu istiyor. Normal dersler kayıyor, küçük gruplar büyük grubun provasının bitmesini koridorda bekliyor. Haftada bir ders alan veli, "Bu ay ders yapmadık, sürekli aynı dans" diye yakınmaya başlıyor. Haksız da sayılmaz.

Bunu baştan söylemek gerek. Mart sonunda velilere kısa bir mesaj: "Nisan sonundan itibaren derslerin büyük kısmı gösteri hazırlığına ayrılacak, bu dönemde teknik çalışma azalır, gösteriden sonra yeniden yoğunlaşacağız." Duyduğunda kimse itiraz etmiyor. Önceden söylenmediğinde şikâyet oluyor.

Ek prova saatleri de ayrı bir meseledir. Çocuk normalde çarşamba geliyor, cumartesi öğlen ek prova koydunuz. O çocuğun cumartesi öğlen başka bir kursu var. Prova saatlerini açıklamadan önce gruplara yazdırın, kim gelemeyecek görün. Bir koreografide yedi kız varsa ve ikisi gelemiyorsa, o prova boşa gitmiş demektir.

## Kim hangi dansta

Bir çocuk iki koreografide çıkıyorsa kostüm değiştirme süresi hesaba katıldı mı? Program sırasını yaparken bunu kâğıda dökmeyen herkes, gösteri günü kulisin arkasında koşan bir eğitmen görür. Sıralamayı yaparken ardışık iki dansta aynı çocuk var mı diye kontrol edin. Basit bir kontrol, ama çoğu zaman son provada fark ediliyor.

Bir de küçük yaş grupları. Üç dört yaşındaki bir çocuk kuliste bir buçuk saat bekleyemez. Küçükleri ilk yarıya alın, bitince aileleriyle gidebilsinler. Bazı veliler için bütün gösteriyi izlemek zor olabiliyor, onlar da teşekkür eder.

## Fotoğraf ve video

Kimsenin gösteri heyecanı içinde düşünmediği konu. Çocukların fotoğraflarını ve videolarını okulun Instagram hesabında paylaşmak istiyorsunuz, kaçınılmaz olarak. Her velinin buna izin vermiş olması lazım. Kayıt sırasında ayrı bir açık rıza formu aldıysanız sorun yok. Almadıysanız gösteriden önce mutlaka alın ve izin vermeyenlerin listesini fotoğrafçıya ya da paylaşım yapacak kişiye verin.

Grup fotoğrafında izin vermeyen bir çocuk varsa ne yapacağınızı önceden düşünün. Sormak zor gelebilir ama sormak, sonradan gelen bir itirazdan çok daha kolaydır.

## Salon, ses, bilet

Gösteri salonunu kiralarken genelde fiyata ve koltuk sayısına bakılır. Sormayı unuttuğunuz şeyler gösteri günü karşınıza çıkar. Provaya sahnede kaç saat giriyorsunuz? Kulis kaç kişilik, çocukların kıyafet değiştireceği bir yer var mı? Ses sistemini kim çalıştıracak, sizin müziğinizi bir önceki günden deneyebilecek misiniz? Salon görevlisi saat kaçta işini bitirip gitmek istiyor?

Müziklerin hepsini tek bir klasörde, sırasıyla ve doğru sürüyle hazırlayın. Telefondan çalan ve arada bildirim sesi veren bir müzik, çok özenle hazırlanmış bir koreografiyi bir anda düşürüyor. Yedeğini de başka bir cihaza alın. Bunu söylemesi kolay, yapan az.

Bilet işi de ayrı bir konu. Salon üç yüz kişilikse ve yetmiş öğrenciniz varsa, aile başına kaç bilet düşer? Boşanmış anne babalar, ikişer dede nineler derken bir aile altı bilet isteyebilir. Sınırı baştan söyleyin. Ücretli mi olacak, ücretsiz mi, ona da erkenden karar verin. Bilet parası salon kirasını karşılıyor olabilir, ama bunu son hafta duyurursanız aileler kırılır.

Kulis için de iki üç gönüllü veli isteyin, tercihen küçük yaş gruplarından. Dört yaşındaki bir çocuğu sahne arkasında sakinleştirmek, eğitmeninizin o sırada yapması gereken iş değil. Gönüllülere ne yapacaklarını bir gün önceden anlatın, kim hangi grubu sahneye çıkaracak belli olsun. Sonuçta bir anne kendi çocuğunu izlemeyi kaçırıyor, ona da teşekkür etmeyi unutmayın.

## Gösteri bittikten sonra

Herkes yorgun, siz de. Ama haziran başı aslında yeni dönemin en verimli zamanı. Aileler çocuklarını sahnede gördü, kurumunuza en sıcak baktıkları günlerdeler. Yaz grubu ya da eylül kaydı için tam o hafta konuşursanız karşılığını alırsınız. Ağustos sonunu beklerseniz o heves soğumuş olur.

Bir de şunu yapın: gösteriden sonraki hafta kendinize on dakika ayırıp bu yıl neyin aksadığını yazın. Salonun ses sistemi, kostümcünün teslim süresi, biletin nasıl dağıtıldığı. Gelecek mayıs bunların hiçbirini hatırlamayacaksınız, inanın.`,
  },
  {
    slug: "dans-grubu-kontenjan-salon",
    category: "dans-bale",
    features: ["grup-dersleri", "coklu-sube-oda-yonetimi", "finans-ozeti"],
    title: "Salı akşamı 18.30 grubu neden hep taşıyor",
    description: "Bir grup yirmi kişiyle boğulurken diğeri beş kişiyle zararına dönüyor. Dans okullarında salon, kontenjan ve açılmayan grup kararları.",
    body: `Bütün dans okullarının bir "salı akşamı 18.30" grubu vardır. Herkes oraya yazılmak ister, çünkü çocuk okuldan çıkmış, anne işten çıkmıştır. Aynı salon cumartesi 10.00'da da boştur, oraya yazılmak isteyen üç kişidir. Kurum sahibi de ikisinin arasında sıkışır: birinde yer açamıyor, öbüründe kira çıkmıyor.

İlk bakışta doluluk gibi görünen bu tablo aslında para kaçırıyordur. Taşan gruptan geri çevirdiğiniz her çocuk büyük ihtimalle başka bir okula gidiyor, boş kalan saatin kirası da yine sizden çıkıyor.

## Bir salona gerçekten kaç kişi sığar

Bunu çoğu okul gözle karar verir. On dört kişilik grup on sekize çıkar, "Bir kişi daha nereye gidecek" denir, yirmi iki olur. Sonra arka sıradaki çocuk kolunu açamaz, eğitmen düzeltme yapamaz, velisi camdan izlerken bunu görür ve birkaç hafta içinde şöyle bir cümle duyarsınız: "Çok kalabalık oldu, çocuk hiç ilgi görmüyor."

Salonunuza ve dansın türüne göre bir üst sınır belirleyin, sonra da ona uyun. Baleyle hip hop aynı alanı istemez. Üst sınırı yazmadığınız sürece o sayı her yeni kayıtta biraz daha yukarı kayar, çünkü kapıdaki veliye hayır demek gerçekten zordur. Listeniz varsa hayır diyen siz değilsinizdir, liste doludur.

## Bekleme listesini telefonda tutmayın

Taşan grubun çözümü bekleme listesidir, ama çoğu okulda bu liste sekreterin aklındadır. "Yer açılırsa ararız." Yer açılınca kimi arayacağını hatırlamaz ya da bir ay önce sormuş veliyi arar, o sırada başka bir yere kaydolmuştur.

Bekleme listesi başka bir şey de söyler size. Salı 18.30 için beş kişi bekliyorsa ve perşembe 18.30'da salon boşsa, yeni bir grup açmak için elinizde gerçek bir sebep var demektir. O beş kişiyi arayıp "Perşembe açıyoruz, gelir misiniz?" diye sorduğunuzda, grup daha açılmadan yarısı dolmuş oluyor. Bekleme listesi tutmayan okul bu kararı tahminle verir.

Kayıt formunu da buna göre yapın. "Hangi günler uygun?" sorusuna birden fazla seçenek işaretletin. Sadece salı yazan veliyle salı ve perşembe yazan veli aynı değildir. Bunu bilmeden yapılan her telefon, boşa gidebilecek bir telefondur.

## Açılmayan grup kararı

Şimdi öbür tarafa geçelim. Eylülde yeni bir yetişkin bale grubu açtınız, dört kişi geldi. Eğitmene ders ücreti ödüyorsunuz, salonun o saati başka bir gruba da satılamıyor. Dört kişinin aidatı eğitmen ücretini bile karşılamıyor olabilir. "Büyür herhalde" diye bekliyorsunuz. Bazen büyür. Çoğu zaman kasıma kadar aynı kalır ve siz de o dört kişiye "Grubu kapatıyoruz" demek zorunda kalırsınız, ki bu dönem başında söylenmesinden çok daha kötüdür.

Bu yüzden bir açılış eşiğiniz olsun. Basit bir hesap yapın: o grubun bir aylık eğitmen maliyeti ne kadar, salonun payı ne kadar, aidat kaç kişide bunu geçiyor? Çıkan sayıyı alın, kayıt sırasında veliye de söyleyin. "Grup en az sekiz kişiyle açılıyor, şu an altı kişiyiz. Dönem başında kesinleşince haber veriyoruz." Bunu duyan veli bozulmaz. Hatta arkadaşını getirebilir.

Eşiğin altında açtığınız bir grup da olabilir, bilerek yaparsınız. Yeni bir branş deniyorsunuzdur, birkaç ay zarar etmeyi göze almışsınızdır. Sorun o değil. Sorun, zarar ettiğinizi aylar sonra Excel'de fark etmektir.

## Küçükleri ve büyükleri ayrı düşünün

Yaş grupları kâğıt üstünde düzgün durur, pratikte öyle değildir. Altı yaşındaki yeni başlayan bir çocukla iki yıldır gelen altı yaşındaki aynı derste sıkılır ya da bunalır. Velinin "Yaşıtlarıyla olsun" isteği ile eğitmenin "Bu çocuk bir üst gruba geçmeli" görüşü çatışır.

Seviye geçişini dönem başına bırakın, ortasında yapmayın. Eğitmenin geçiş önerisini veliyle konuşma işini de eğitmene bırakmayın. Eğitmen çocuğu iyi tanır ama veli konuşmaları için o kadar rahat olmayabilir. Kısa bir değerlendirme yazılı dursun, konuşmayı kurumdan biri yapsın.

## "Arkadaşıyla aynı grupta olsun"

Bu isteği her dönem duyarsınız. İki anne birlikte gelir, çocuklar da birlikte başlamak ister. İlk bakışta sorun yok, hatta iyi bir şey. Birlikte gelen çocuklar daha geç bırakıyor. Sorun, ikisinin seviyesi aynı olmadığında ya da yeri tek kişilik olan bir gruba iki kişi yazılmak istediğinde çıkıyor.

Kuralınız net olsun: seviye uygunsa ve yer varsa aynı gruba alırız, değilse başka bir saatte birlikte başlayabilecekleri bir grup öneririz. Veli bunu reddetmekten çok bir alternatif olarak duyar. Eğitmene "Şu ikisini birlikte almam gerekiyor, anneleri rica etti" diye baskı yaptığınızda ise ders kalitesinden ödün veriyorsunuzdur ve bunu en önce o iki çocuk hisseder.

Kardeşler de ayrı bir başlık. Yedi ve on yaşında iki kız kardeşi aynı saate koymak mümkün değil çoğu zaman, ama anne iki ayrı gün gelmek istemez. Programı yaparken ardışık saatlerde benzer yaş gruplarını yan yana koymak bu sorunu kendiliğinden çözebiliyor: 17.00'de küçükler, 18.00'de bir üstü. Anne bir buçuk saatte iki çocuğunu bitiriyor. Bunun karşılığında genelde kardeş indirimi de sorulur. İndirimi yapacaksanız bunu bir kez hesaplayın ve herkes için aynı oranı uygulayın. Veliler birbirleriyle konuşur, kapıda ayrı ayrı verilen indirimler bir gün mutlaka ortaya çıkar.

## Haftaya bakın

Bir pazar akşamı, haftanın programını salon salon çıkarıp karşınıza koyun. Hangi saatler dolu, hangileri boş, hangi grup kaç kişi. Bunu yılda bir kez bile yapan okul sayısı az, oysa on dakika sürüyor. Sabah 11.00'de boş duran salonunuzu yetişkinlere, emeklilere, ev hanımlarına verebileceğinizi orada görürsünüz. Salı 18.30'u da artık bir şikâyet olarak değil, açmanız gereken ikinci grubun işareti olarak okumaya başlarsınız.`,
  },
  {
    slug: "pilates-paket-bitmeden-haber-vermek",
    category: "yoga-pilates",
    features: ["odeme-takibi", "crm", "duyuru-iletisim"],
    title: "On seanslık paket bittiğinde üye neden sessizce kayboluyor",
    description: "Pilates ve yoga stüdyolarında üye kaybı çoğu zaman bir kavgayla olmaz. Paket biter, kimse bir şey demez, üye bir daha gelmez.",
    body: `Stüdyonuza gelmeyi bırakan üyelerin çoğu size kızgın değildir. Bu, kabul etmesi hem rahatlatıcı hem can sıkıcı bir gerçek. On seanslık paketi bitti, o hafta işleri yoğundu, bir sonraki pakete karar vermedi, siz de bir şey demediniz. İki hafta geçti, üç hafta geçti. Artık geri dönmek için bir bahane gerekiyor ve o bahane gelmiyor.

Kimse kapıyı çarpıp gitmedi. Sadece bir alışkanlık bitti.

## Paket son seansta bitmez, sekizinci seansta biter

Çoğu stüdyo yenilemeyi son seansın sonunda konuşur. Üye matından kalkmış, terlemiş, çıkmak üzere, belki çocuğunu okuldan alacak. Resepsiyondaki arkadaş "Paketiniz bitti bu arada, yenileyelim mi?" diyor. Üye "Bir bakayım, size dönerim" diyor. Dönmüyor.

Oysa sekizinci seans civarı çok farklı bir an. Üye hâlâ düzenli geliyor, belki bedeninde bir şeyler değişmeye başladığını fark etmiş, karar vermek için bir baskı yok. Eğitmen dersin sonunda "Bu aralar omzun çok daha iyi, iki seansın kalmış, devam edelim mi?" derse konuşma bambaşka geçiyor. Satış gibi durmuyor, çünkü gerçekten bir şey konuşuluyor.

Bunun için tek gereken şey, hangi üyenin kaç seansı kaldığını eğitmenin ders öncesinde görebilmesi. Eğitmen bunu kafasında tutamaz, tutmak zorunda da değil. O gün derse gelecek altı kişinin yanında küçük bir "2 seans kaldı" yazısı yeterli.

## Hiç gelmeyenler listesi

Aslında daha önemli olan başka bir liste var. Paketi bitmemiş ama üç haftadır gelmemiş insanlar. Bir üye beş seans kullanıp kaybolduysa bir şey olmuştur. İşi değişmiştir, canı bir şeye sıkılmıştır, belki eğitmenle ufak bir mesele yaşamıştır, belki sadece unutmuştur.

Bu kişilere ayda bir kez bakın. Sekreterin ya da sizin göndereceğiniz kısa, kişisel bir mesaj çok şey değiştiriyor. Şablon gibi durmasın. "Ayşe Hanım merhaba, üç haftadır görüşemedik, her şey yolundadır umarım. Perşembe akşam grubumuzda yeriniz hazır, gelmek isterseniz yazmanız yeterli." Kampanya yok, indirim yok. Sadece fark edildiğini bilmek bile insanı geri getiriyor.

İndirim konusunda dikkatli olun, bu arada. Bir süre gelmeyen herkese indirim teklif ederseniz, düzenli gelen ve tam fiyat ödeyen üyenize haksızlık etmiş olursunuz. Stüdyolar küçük yerlerdir, bu tür şeyler duyulur.

## Paket süresi ve dondurma

Son kullanma tarihi konusu pilatesçilerin en çok tartıştığı konulardan biridir. On seanslık paketi kaç haftada bitirmek gerekir? Süre koymazsanız altı ay önce alınmış bir paketin üç seansı hesapta durur, üye bir gün gelir ve kullanmak ister. Fiyatlar değişmiştir, siz yine eski fiyattan hizmet verirsiniz. Süreyi fazla sıkı tutarsanız da hasta olup iki hafta gelemeyen biri hakkını yitirir ve kırılır.

Çoğu stüdyo için işe yarayan orta yol şöyle: makul bir süre koyun ve sağlık ya da seyahat gibi durumlarda paketi dondurma imkânı tanıyın. Ama kuralı baştan söyleyin. Satın alırken üyenin önüne konan iki satırlık yazı, üç ay sonraki tatsız konuşmayı önlüyor. Dondurmayı kaydetmeyi de unutmayın, yoksa üye hakkını aradığında hiçbir kaydınız olmuyor. Elinizde "Geçen ay Fatma Hanım dondurmuştu galiba" gibi bir hatıra kalıyor.

## Yenilemeyen üyeye ne söylemeli

Paketi bitmiş, üç haftadır ses yok. Mesajınız kısa olsun ve bir soru içersin. "Paketiniz bitmişti, biz yerinizi merak ettik. Bir sebebi varsa öğrenmek isteriz, bir şeyi iyi yapamadıysak söylemenizi rica ederiz." Bu mesaja cevap verenler size çok şey öğretir. Biri "Saatler uymuyor artık" der, çünkü işi değişmiştir, ona sabah grubunu söylersiniz. Biri "Fiyat bana ağır geldi" der, sekiz seanslık bir paket önerebilirsiniz. Biri de "Son eğitmenle pek anlaşamadım" der. Bunu duymak zor, ama duymamak daha pahalı.

Aynı cevaptan üç tane geldiğinde durun. Üç kişi aynı saati, aynı eğitmeni ya da aynı konuyu söylüyorsa bu tesadüf olmayabilir. Yalnız cevapları bir yere yazmazsanız bunu fark etmeniz mümkün değil, çünkü aylar arayla geldiklerinde akılda kalmıyor.

Kaybedilen üyeyi geri almak için en iyi an bazen aylar sonrasıdır. İnsanlar yeni yılda, yaz öncesinde ya da bir doktor önerisiyle yeniden başlamayı düşünür. Eski üyelerinize yılda bir iki kez, satış dili olmadan, "Yeni sabah grubumuz açıldı, aklımıza siz geldiniz" diye yazmak hoş karşılanıyor. Tabii bu mesajlar ticari ileti sayılabilir. O kişinin onayını baştan almış olmanız gerekiyor, kayıt sırasında bunun için ayrı bir kutu koyun. Hem kanuna uymuş olursunuz hem de karşınızdakini rahatsız etmediğinizden emin olursunuz.

## Küçük notlar büyük fark yaratıyor

Bir üye dizinden şikâyet ediyor, eğitmen bunu biliyor. Geçen dersten sonra başka bir eğitmene girdi, o bilmiyordu ve aynı hareketi yaptırdı. Üyeniz bir şey demedi ama eve giderken aklından geçen şu oldu: "Burada kimse beni tanımıyor."

Boutique stüdyoların büyük zincirlere karşı tek gerçek avantajı insanı tanımaktır. Bu avantajı eğitmenin hafızasına bırakırsanız, eğitmen ayrıldığı gün o bilgi de gider. Üyenin sağlık notları, tercihleri, geçen ay ne konuştuğunuz, ortak bir yerde duruyorsa yeni bir eğitmen de aynı özenle karşılayabilir onu. Tabii sağlık bilgisi hassas bir bilgidir, herkesin görebileceği bir yerde durmamalı. Yalnızca o üyeyle çalışacak eğitmen görebilsin.

Hepsini bir arada düşünün. Kalan seansı gören eğitmen, gelmeyeni fark eden resepsiyon, dondurmayı kaydeden sistem ve üyeyi tanıyan bir not. Hiçbiri büyük iş değil. Ama yeni üye bulmak için reklama harcadığınız parayı düşünürseniz, elinizdekini tutmak için yapılabilecek en ucuz şeyler bunlar.`,
  },
  {
    slug: "reformer-son-dakika-iptal-kurali",
    category: "yoga-pilates",
    features: ["ders-programi", "yoklama-takvimi", "sozlesme-yonetimi"],
    title: "Son dakika iptali kuralını koyup sonra uygulayamayan stüdyolar için",
    description: "Altı reformerlı bir stüdyoda bir iptal, boş bir alet ve yanmış bir saat demek. Kuralı koymak kolay, uygulamak zor. Nasıl yapılır, konuşalım.",
    body: `Sabah dokuz dersi. Altı reformer, altı isim. Sekiz buçukta mesaj geliyor: "Çocuk hastalandı, bugün gelemeyeceğim, çok özür dilerim." Yedi dakika sonra bir tane daha. Eğitmen yine geliyor, kira yine işliyor, derste dört kişi var ve iki alet boş duruyor. Bu iki yer, on dakika önce söylenseydi bekleme listesindeki birine verilebilirdi.

Bu yüzden her stüdyonun bir iptal kuralı var. Genelde "12 saat önce haber verilmeyen ders yanar" gibi bir şey. Duvarda yazar, Instagram'da yazar. Sonra sekiz buçukta o mesaj gelir ve yazan kişi iki yıldır gelen, sevdiğiniz bir üyedir. Çocuğu da gerçekten hastadır. Resepsiyondaki arkadaş size bakar. Siz "Bu seferlik yakmayalım" dersiniz.

Bir ay sonra başka bir üye aynısını yaşar, bu sefer yakarsınız. O üye de geçen ayki hikâyeyi duymuştur. İşte kural o gün bitti.

## Kuralın ne olduğu kadar kim için olduğu da önemli

Herkese eşit uygulanmayan bir kural kuraldan çok ruh hâli gibi görünür. Ama her durumu aynı kefeye koymak da insanlık dışı. Çözüm kuralı katılaştırmak değil, esnekliği de kurala yazmak.

Pek çok stüdyonun işine yarayan yöntem şöyle: herkesin dönem başına ya da paket başına bir "hak geç" hakkı var. On seanslık pakette bir kez son dakika iptal edebilirsin, seansın yanmaz. İkincisinde yanar. Böylece hasta çocuk durumu için tartışma açılmaz, çünkü herkesin bir hakkı var. Resepsiyondaki arkadaş da takdir yetkisi kullanmak zorunda kalmaz, sadece bakar: hakkı var mı, yok mu.

Hasta raporu gibi belge isteme yoluna girmeyin. Yoga stüdyosu, okul idaresi değil. Üyenizi şüphelinin konumuna koyduğunuz anda ilişki bozulur.

## Saat kaça göre?

Kuralı yazarken "12 saat önce" diyorsanız bunun nasıl ölçüleceğini de düşünmek lazım. Akşam dokuzda stüdyonun kapalı numarasına gelen bir WhatsApp sayılıyor mu? Resepsiyon sabah sekizde gördüyse 12 saati kaçırmış mı oluyor? Bu sorunun sıkıcı cevabı kavgaların çoğunu önlüyor: üye iptali kendisi bir yerden yapıyorsa ve saat oraya kaydoluyorsa, kimse kimseyle tartışmıyor.

Sabah dersleri için ayrı bir süre de düşünebilirsiniz. Sabah yedi dersini on iki saat önce iptal etmek, akşam yedide karar vermek demek. Bazı stüdyolar sabah dersleri için "önceki akşam 21.00" gibi bir sınır koyuyor. İnsanın hayatına daha uygun, uygulaması da kolay.

## Boşalan yeri boşa harcamayın

Kuralın asıl amacı üyeyi cezalandırmak değil, o saati değerlendirebilmek olmalı. Boşalan yer bekleme listesindeki birine otomatik olarak gidebiliyorsa, işin büyük kısmı zaten çözülmüş demektir. Üye iptal ediyor, listede sıradaki kişiye mesaj gidiyor, kabul ederse yer doluyor. Bu durumda siz de bir üyeye "Bu sefer yakmadım çünkü yerin doldu" diyebilirsiniz. Üye bunu duyunca sevinir, size de hiçbir şeye mal olmaz.

## Hep aynı üye

Bir stüdyoda iptal sorununun büyük kısmı genelde birkaç kişiden gelir. Bazı üyeler her hafta yazar, her hafta bir sebep vardır. Bazıları hiç haber vermeden gelmez. Bunlar farklı şeylerdir. Haber vermeyen üye için aletin başka birine verilme şansı sıfırdır, üstelik eğitmen dersi başlatmak için beş dakika bekler ve diğerlerinin vakti gider.

Kayıtlara bakarsanız kimin olduğunu görürsünüz. Bu kişiyle yapılacak konuşma kuralı hatırlatmak olmamalı, çünkü o kuralı biliyor. Daha çok şu olmalı: "Son bir ayda dört dersiniz iptal oldu. Salı sabahı galiba size uymuyor, perşembe akşama alsak daha rahat mı edersiniz?" Çoğu zaman kişi gerçekten yanlış bir saate yazılmıştır, ayıp olmasın diye değiştirmek istememiştir. Saati değişince sorun da bitiyor.

Bazı durumlarda ise sorun saat değildir, üyenin hayatı şu an buna elvermiyordur. O zaman sabit grup yerine haftalık rezervasyonla gelmesini önerebilirsiniz. Sabit yerini kaybeder, ama istediği zaman boş olan yere yazılır. Siz de o haftanın saatini baştan boşaltmış olursunuz.

Dikkat edilecek tek şey, bu tür uyarıların kapıda ya da başka üyelerin yanında yapılmaması. Üyenin devam durumu kimseyi ilgilendirmez. Bir de eğitmenlerin kendi aralarında bir üyeyi "yine gelmedi" diye konuşması bazen duyulur. Küçük yerlerde her şey duyulur, bunu ekibinize söylemekten çekinmeyin.

## Bunu nasıl söylemeli

Kural kayıt sırasında konuşulmazsa ilk uygulandığında sert gelir. Üyeye bir kez, sade bir dille anlatın. "Derslerimizde alet sayısı sınırlı, bu yüzden 12 saat önceden haber vermediğiniz seans paketinizden düşer. Her pakette bir kez bu kuralı esnetebiliyoruz, başınıza bir şey gelirse sorun olmaz." Bu kadar. Dört paragraflık bir yönetmelik metni kimse okumaz.

Yanan seansı üyeye bildirirken de üslup önemli. "Seansınız yakılmıştır" yazmayın. "Bugünkü dersinizi son dakikada iptal ettiğiniz için paketinizden bir seans düştü, 4 seansınız kaldı. Haftaya görüşmek üzere." Bilgi veriyor, azarlamıyor.

Bir de eğitmen tarafı var. Üye son dakika iptal etse de eğitmenin ücreti nasıl hesaplanıyor? Dersin tamamen boşaldığı bir durumda ne olacak, eğitmen eve mi gönderilecek? Bir kişi kalsa ders yapılıyor mu? Bunlar da önceden konuşulması gereken şeyler. Eğitmeninize bir sabah "Bugün ders yok, ücret de yok" demek zorunda kalırsanız o eğitmen başka stüdyolara da bakmaya başlar.

Dönüp baktığınızda bütün mesele şu: yazdığınız kuralı uygulayabilecek kadar makul yazın. Uygulayamadığınız sert bir kuraldan, her seferinde uyguladığınız yumuşak bir kural daha iyidir.`,
  },
];
