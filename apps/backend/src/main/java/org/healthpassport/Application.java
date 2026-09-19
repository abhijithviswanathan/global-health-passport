/**
 * Spring Boot entry point. Component scanning discovers the API controllers and services
 * in this package; database configuration and Flyway startup live in application.properties.
 */
package org.healthpassport;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
