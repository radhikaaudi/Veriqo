# Veriqo test assets: vehicle photos

`vehicles/` holds 11 JPEG test images for checking how Veriqo handles different photo-inspection scenarios. `vehicles/manifest.json` lists every file with the scenario it covers, what is visible in it, the expected app behaviour, its source, author, licence and any changes made.

## Where the photos come from

- Every photo is a **real photograph from Wikimedia Commons**. Each one is used under its own licence (public domain, CC0, CC BY 2.0 or CC BY-SA 4.0).
- **None of the photos shows a customer vehicle.** They are public photos of unrelated cars, chosen only for testing.
- **No registration data is implied by any photo.** Visible number plates were blurred until unreadable, and nothing in the images should be read as a car's identity, owner, history or registration.
- Processing applied to every file: resized to at most 1600 px on the long edge, saved as JPEG quality 88, all EXIF/metadata removed.
- Files 01–03 show the same car: one Commons uploader's photo series of a silver VW Vento (`same_vehicle_group: "A"`).

## Derived files

- `09-blurry-car.jpg`: **derived/synthetic.** It is `01-clean-front.jpg` with a strong Gaussian blur applied, to test low-confidence handling.
- `10-missing-coverage.jpg`: **derived.** It is a crop of `01-clean-front.jpg` that shows only the bonnet and front, to test missing-view detection.

The Commons photos underneath them are real. Both derived files are shared under the original CC BY-SA 4.0 licence.

## Attribution

| File | Shows | Author | Licence | Source | Modifications |
|---|---|---|---|---|---|
| 01-clean-front.jpg | Silver VW Vento sedan, front three-quarter | Ank Kumar | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Silver_Volkswagen_Vento_Sedan_(front_view)_at_Sky_gold_Aeroview_apartment,_Devanahalli,_Bengaluru,_Karnataka,_India_(Ank_Kumar,_INFOSYS_Limited)_02.jpg) | resized; plate blurred; EXIF stripped |
| 02-clean-side.jpg | Same car, right side profile | Ank Kumar | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Silver_Volkswagen_Vento_Sedan_(side_view)_at_Sky_gold_Aeroview_apartment,_Devanahalli,_Bengaluru,_Karnataka,_India_(Ank_Kumar,_INFOSYS_Limited)_01.jpg) | resized; EXIF stripped |
| 03-clean-rear.jpg | Same car, rear three-quarter | Ank Kumar | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Silver_Volkswagen_Vento_Sedan_(rear_view)_at_Sky_gold_Aeroview_apartment,_Devanahalli,_Bengaluru,_Karnataka,_India_(Ank_Kumar,_INFOSYS_Limited)_03.jpg) | resized; plate blurred; EXIF stripped |
| 04-visible-scratch.jpg | Key scratches across car doors | Athol Mullen | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:KeyedPaintOnCar.JPG) | resized; EXIF stripped |
| 05-door-dent.jpg | Large dent in a front door (window taped over) | Garitzko | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Damaged_car_door.jpg) | cropped; resized; EXIF stripped |
| 06-rust-wheel-arch.jpg | Rust on the wheel-arch lip of a Saab 900 | Ildar Sagdejev (Specious) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:2008-12-23_1989_Saab_900_Turbo_fender_damage.jpg) | resized; EXIF stripped |
| 07-worn-tyre.jpg | Bald tyre tread | PookieFugglestein | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) | [Commons](https://commons.wikimedia.org/wiki/File:Bald_tyre.jpg) | resized; EXIF stripped |
| 08-interior-damage.jpg | Torn driver's seat bolster with foam showing | Shixart1985 | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [Commons](https://commons.wikimedia.org/wiki/File:A_detailed_look_at_a_worn_car_seat.jpg) | resized; EXIF stripped |
| 09-blurry-car.jpg | Blurred version of 01 (derived) | Ank Kumar (original) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Silver_Volkswagen_Vento_Sedan_(front_view)_at_Sky_gold_Aeroview_apartment,_Devanahalli,_Bengaluru,_Karnataka,_India_(Ank_Kumar,_INFOSYS_Limited)_02.jpg) | derived from 01; strong Gaussian blur; EXIF stripped |
| 10-missing-coverage.jpg | Bonnet/front-only crop of 01 (derived) | Ank Kumar (original) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Commons](https://commons.wikimedia.org/wiki/File:Silver_Volkswagen_Vento_Sedan_(front_view)_at_Sky_gold_Aeroview_apartment,_Devanahalli,_Bengaluru,_Karnataka,_India_(Ank_Kumar,_INFOSYS_Limited)_02.jpg) | derived from 01; cropped; EXIF stripped |
| 11-multiple-issues.jpg | Cracked bumper, peeling paint, broken corner, rust | Shixart1985 | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [Commons](https://commons.wikimedia.org/wiki/File:Close_view_of_a_damaged_car_front_in_an_outdoor_setting_during_daylight_hours_near_a_road_in_a_city_area_with_visible_wear_and_tear.jpg) | resized; EXIF stripped |

If you redistribute the CC BY-SA images or anything derived from them, it must stay under CC BY-SA, and the author credit above must be kept.

## Expected behaviour

- **Clean images (01–03):** the visible condition looks fine, but this is **not** an all-clear. Mechanical condition and history are still "Not checked".
- **Single-defect images (04–08):** one Observed finding of the matching type.
- **09:** low confidence. The app should ask for clearer photos and make no confident findings.
- **10:** the app should flag the missing views (sides, rear, tyres, interior).
- **11:** each visible issue should be reported as its own Observed finding.
