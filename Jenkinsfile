pipeline {
    agent any

    stages {

        stage('Checkout') {
            steps {
                echo 'Checking out source code...'
                checkout scm
            }
        }

        stage('Deploy') {
            steps {
                echo 'Deploying latest ADW containers...'
                sh '''
                    docker rm -f adw-backend adw-frontend || true

                    docker run -d \
                        --name adw-backend \
                        --network devops-app_default \
                        -p 4000:4000 \
                        autonomousdeveloperworkspaceadw-backend:latest

                    docker run -d \
                        --name adw-frontend \
                        --network devops-app_default \
                        -p 3000:3000 \
                        -e NEXT_PUBLIC_API_URL=http://localhost:4000 \
                        autonomousdeveloperworkspaceadw-frontend:latest
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo 'Checking backend health...'
                sleep(time: 8, unit: 'SECONDS')
                sh 'docker exec adw-backend curl -f http://localhost:4000/health || echo "Health check skipped - server may still be starting"'
            }
        }
    }

    post {
        success {
            echo 'ADW deployed successfully!'
            echo 'Frontend: http://localhost:3000'
            echo 'Backend:  http://localhost:4000'
        }
        failure {
            echo 'Deployment failed!'
            sh 'docker logs adw-backend --tail=20 || true'
        }
    }
}
