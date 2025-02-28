<?php
// A fájl nevét itt beállíthatjuk, vagy dinamikusan generálhatjuk
$uploadDir = 'drawings/';
$fileName = 'canvas_image_' . time() . '.png';

if (isset($_POST['image'])) {
    // A kép base64 kódolt adatainak dekódolása
    $imageData = $_POST['image'];

    // Levágjuk az adat URI prefixet (data:image/png;base64,)
    $imageData = str_replace('data:image/png;base64,', '', $imageData);
    $imageData = base64_decode($imageData);

    // A fájl mentése
    file_put_contents($uploadDir . $fileName, $imageData);

    echo 'A kép sikeresen feltöltve!';
} else {
    echo 'Nincs kép adat.';
}
?>
