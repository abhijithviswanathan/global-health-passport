package db.migration;

import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.healthpassport.HealthIds;

/** Preserve historical IDs as aliases; patient UUIDs and clinical references never change. */
public class V10__compact_health_ids extends BaseJavaMigration {
  @Override
  public void migrate(Context context) throws Exception {
    Connection db = context.getConnection();
    List<String[]> patients = new ArrayList<>();
    try (var query =
            db.prepareStatement("select id, health_id from app_user where health_id is not null");
        var rows = query.executeQuery()) {
      while (rows.next()) patients.add(new String[] {rows.getString(1), rows.getString(2)});
    }
    for (String[] patient : patients) {
      if (HealthIds.isCompact(patient[1])) continue;
      String compact;
      do {
        compact = HealthIds.generate();
      } while (exists(db, compact));
      try (var alias =
              db.prepareStatement("insert into health_id_alias(alias,user_id) values(?,?)");
          var update = db.prepareStatement("update app_user set health_id=? where id=?")) {
        alias.setString(1, HealthIds.normalize(patient[1]));
        alias.setString(2, patient[0]);
        alias.executeUpdate();
        update.setString(1, compact);
        update.setString(2, patient[0]);
        update.executeUpdate();
      }
    }
  }

  private boolean exists(Connection db, String value) throws Exception {
    try (var query = db.prepareStatement("select id from app_user where health_id=?")) {
      query.setString(1, value);
      try (var rows = query.executeQuery()) {
        return rows.next();
      }
    }
  }
}
