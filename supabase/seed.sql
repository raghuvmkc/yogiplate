-- Seed menus, coupons, and settings after schema.sql

insert into menu_categories (id, name, sort_order) values
  ('cat-starters', 'Starters & Chaat', 1),
  ('cat-mains', 'Mains & Curries', 2),
  ('cat-breads', 'Breads & Rice', 3),
  ('cat-sides', 'Sides & Raita', 4),
  ('cat-sweets', 'Sweets & Desserts', 5),
  ('cat-italian', 'Italian Vegetarian', 6),
  ('cat-packages', 'Catering Packages', 7)
on conflict (id) do nothing;

insert into menu_items (id, category_id, name, description, price, unit, diet_tags, notes, min_quantity) values
  ('item-samosa', 'cat-starters', 'Vegetable Samosa', 'Crisp pastry with spiced potato and peas, fried fresh to order.', 2.50, 'piece', array['swaminarayan','pushtimarg','vegan','italian','pure_vegetarian']::diet_tag[], 'Contains potato (not Jain).', null),
  ('item-jain-samosa', 'cat-starters', 'Jain Samosa', 'No root vegetables — filled with cabbage, peas, and mild spices.', 2.75, 'piece', array['jain','swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-paneer-tikka', 'cat-starters', 'Paneer Tikka Skewers', 'Char-grilled cottage cheese with bell peppers in tandoori marinade.', 18, 'tray (serves 8)', array['swaminarayan','pushtimarg','italian','pure_vegetarian']::diet_tag[], null, null),
  ('item-jain-tikka', 'cat-starters', 'Jain Paneer Tikka', 'Onion- and garlic-free marinade with tomato and mild spices.', 19, 'tray (serves 8)', array['jain','swaminarayan','pushtimarg','pure_vegetarian']::diet_tag[], null, null),
  ('item-bhel', 'cat-starters', 'Bhel Puri Station', 'Crisp puffed rice, chutneys, and fresh toppings — assembled on site.', 6.50, 'per guest', array['swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, 20),
  ('item-jain-bhel', 'cat-starters', 'Jain Bhel', 'Root-free chaat with fresh chutneys and sev.', 7, 'per guest', array['jain','swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, 20),
  ('item-dal-makhani', 'cat-mains', 'Dal Makhani', 'Slow-simmered black lentils in a rich tomato-butter finish.', 45, 'half tray', array['swaminarayan','pushtimarg','italian','pure_vegetarian']::diet_tag[], null, null),
  ('item-jain-dal', 'cat-mains', 'Jain Dal Fry', 'Yellow lentils tempered without onion or garlic.', 42, 'half tray', array['jain','swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-chole', 'cat-mains', 'Chole Masala', 'Punjabi chickpeas in aromatic gravy — pure and hearty.', 42, 'half tray', array['swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-jain-chole', 'cat-mains', 'Jain Chole', 'Chickpea curry prepared strictly without onion or garlic.', 44, 'half tray', array['jain','swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-paneer-butter', 'cat-mains', 'Paneer Butter Masala', 'Soft paneer in silky tomato gravy — a crowd favorite.', 55, 'half tray', array['swaminarayan','pushtimarg','italian','pure_vegetarian']::diet_tag[], null, null),
  ('item-jain-paneer', 'cat-mains', 'Jain Paneer Angara', 'Smoky tomato-cashew gravy, no onion or garlic.', 58, 'half tray', array['jain','swaminarayan','pushtimarg','pure_vegetarian']::diet_tag[], null, null),
  ('item-veg-korma', 'cat-mains', 'Navratan Korma', 'Garden vegetables in creamy cashew sauce.', 52, 'half tray', array['swaminarayan','pushtimarg','pure_vegetarian']::diet_tag[], null, null),
  ('item-vegan-curry', 'cat-mains', 'Coconut Vegetable Curry', 'Seasonal vegetables in fragrant coconut milk — fully vegan.', 48, 'half tray', array['vegan','jain','swaminarayan','pushtimarg','pure_vegetarian']::diet_tag[], null, null),
  ('item-undhiyu', 'cat-mains', 'Surati Undhiyu', 'Winter specialty with mixed vegetables and methi muthiya.', 60, 'half tray', array['swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-naan', 'cat-breads', 'Butter Naan', 'Soft tandoor bread brushed with butter.', 2.50, 'piece', array['swaminarayan','pushtimarg','italian','pure_vegetarian']::diet_tag[], null, null),
  ('item-roti', 'cat-breads', 'Phulka Roti', 'Light whole-wheat rotis, perfect for large gatherings.', 1.50, 'piece', array['jain','swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-paratha', 'cat-breads', 'Laccha Paratha', 'Flaky layered flatbread.', 3, 'piece', array['jain','swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-jeera-rice', 'cat-breads', 'Jeera Rice', 'Basmati rice tempered with cumin.', 28, 'half tray', array['jain','swaminarayan','pushtimarg','vegan','italian','pure_vegetarian']::diet_tag[], null, null),
  ('item-pulao', 'cat-breads', 'Vegetable Pulao', 'Fragrant basmati with garden vegetables and whole spices.', 35, 'half tray', array['swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-jain-pulao', 'cat-breads', 'Jain Vegetable Pulao', 'Root-free vegetable pulao with pure spices.', 36, 'half tray', array['jain','swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-raita', 'cat-sides', 'Cucumber Raita', 'Cool yogurt with cucumber and roasted cumin.', 22, 'half tray', array['swaminarayan','pushtimarg','italian','pure_vegetarian']::diet_tag[], null, null),
  ('item-salad', 'cat-sides', 'Fresh Kachumber', 'Tomato, cucumber, and cilantro salad — bright and clean.', 20, 'half tray', array['jain','swaminarayan','pushtimarg','vegan','italian','pure_vegetarian']::diet_tag[], null, null),
  ('item-papad', 'cat-sides', 'Roasted Papad', 'Crisp lentil wafers.', 1.25, 'piece', array['jain','swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-gulab', 'cat-sweets', 'Gulab Jamun', 'Soft milk dumplings in warm cardamom syrup.', 2.50, 'piece', array['swaminarayan','pushtimarg','italian','pure_vegetarian']::diet_tag[], null, null),
  ('item-jalebi', 'cat-sweets', 'Fresh Jalebi', 'Crisp saffron swirls made the morning of your event.', 12, 'lb', array['jain','swaminarayan','pushtimarg','vegan','pure_vegetarian']::diet_tag[], null, null),
  ('item-kheer', 'cat-sweets', 'Rice Kheer', 'Slow-cooked rice pudding with cardamom and nuts.', 30, 'half tray', array['jain','swaminarayan','pushtimarg','pure_vegetarian']::diet_tag[], null, null),
  ('item-vegan-halwa', 'cat-sweets', 'Vegan Carrot Halwa', 'Plant-based gajar halwa with coconut milk.', 32, 'half tray', array['vegan','jain','swaminarayan','pushtimarg','pure_vegetarian']::diet_tag[], null, null),
  ('item-margherita', 'cat-italian', 'Margherita Pizza Tray', 'San Marzano tomato, fresh mozzarella, basil — vegetarian.', 48, 'large tray', array['italian']::diet_tag[], null, null),
  ('item-pasta-primavera', 'cat-italian', 'Pasta Primavera', 'Seasonal vegetables tossed in light olive oil and herbs.', 55, 'half tray', array['italian','vegan']::diet_tag[], null, null),
  ('item-lasagna', 'cat-italian', 'Vegetable Lasagna', 'Layered pasta with ricotta, spinach, and roasted vegetables.', 65, 'half tray', array['italian']::diet_tag[], null, null),
  ('item-caprese', 'cat-italian', 'Caprese Platter', 'Heirloom tomatoes, mozzarella, basil, and balsamic.', 40, 'platter', array['italian']::diet_tag[], null, null),
  ('item-risotto', 'cat-italian', 'Mushroom Risotto', 'Creamy arborio rice with wild mushrooms.', 58, 'half tray', array['italian']::diet_tag[], null, null),
  ('pkg-jain-25', 'cat-packages', 'Jain Celebration Package', 'Starter, two mains, dal, rice, roti, salad, and sweet — fully Jain.', 22, 'per guest', array['jain']::diet_tag[], null, 25),
  ('pkg-swami-25', 'cat-packages', 'Swaminarayan Feast Package', 'Sattvic full menu with starters, curries, breads, rice, and dessert.', 20, 'per guest', array['swaminarayan']::diet_tag[], null, 25),
  ('pkg-pushti-25', 'cat-packages', 'Pushtimarg Seva Package', 'Pure vegetarian thali-style catering for seva and gatherings.', 21, 'per guest', array['pushtimarg']::diet_tag[], null, 25),
  ('pkg-vegan-25', 'cat-packages', 'Bay Area Vegan Package', 'Completely plant-based menu with bold flavor and fresh produce.', 23, 'per guest', array['vegan']::diet_tag[], null, 25),
  ('pkg-pureveg-25', 'cat-packages', 'Pure Vegetarian Feast Package', 'Starters, curries, breads, rice, and dessert — classic Indian vegetarian for every celebration.', 20, 'per guest', array['pure_vegetarian']::diet_tag[], null, 25),
  ('pkg-italian-25', 'cat-packages', 'Italian Vegetarian Package', 'Pasta, salad, bread, and dessert — elegant for mixed gatherings.', 24, 'per guest', array['italian']::diet_tag[], null, 25)
on conflict (id) do nothing;

insert into coupons (id, code, type, value, min_order, max_uses, used_count, is_active) values
  ('coupon-welcome10', 'WELCOME10', 'percent', 10, 75, 500, 0, true),
  ('coupon-bay25', 'BAY25', 'fixed', 25, 150, 200, 0, true)
on conflict (id) do nothing;

insert into settings (
  id, kitchen_address, kitchen_lat, kitchen_lng, base_delivery_fee, rate_per_mile,
  free_delivery_threshold, tax_rate, service_radius_miles, business_name, business_email, business_phone
) values (
  1, 'Fremont, CA 94538', 37.5485, -121.9886, 15, 2.5, 250, 0.0975, 50,
  'Yogiplate Catering', 'orders@yogiplate.com', '(510) 555-0199'
) on conflict (id) do update set kitchen_address = excluded.kitchen_address;
