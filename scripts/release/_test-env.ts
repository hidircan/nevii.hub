// node:test dosyaları için: uzak test DB'si yok (local-first); testler uydurma bir test ref'iyle çalışır.
// Guard modülü env'i yükleme anında okuduğu için bu import test dosyasında İLK sırada olmalı.
process.env.TEST_SUPABASE_REF ||= "testref0000000000000";
