drop trigger account_touch on account;
create trigger account_touch before update or insert on account for each row execute function touch();
