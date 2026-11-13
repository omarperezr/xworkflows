create trigger t before insert on sale for each row execute function f();
new.unit_price := (select price from item where id = new.item_id);
